/*
 * grunt-cmd-concat
 * https://github.com/spmjs/grunt-cmd-concat
 *
 * Copyright (c) 2013 Hsiaoming Yang
 * Licensed under the MIT license.
 */

var path = require('path');

module.exports = function(grunt) {

  var ast = require('cmd-util').ast;
  var iduri = require('cmd-util').iduri;
  var script = require('./lib/script').init(grunt);
  var style = require('./lib/style').init(grunt);

  var processors = {
    '.js': script.jsConcat,
    '.css': style.cssConcat
  };

  var count = 0;

  grunt.registerMultiTask('cmdconcat', 'concat cmd modules.', function() {
    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      separator: grunt.util.linefeed,
      uglify: {
        beautify: true,
        comments: true
      },
      paths: ['sea-modules'],
      processors: {},
      include: 'self',
      noncmd: false,
      banner: '',
      footer: '',
      //是否进行文件拆分，优化存储
      split: {
        //开关
        turnOn:false,
        //单个文件大小限制
        limit : 50,
        //忽略列表  字符串或数组，要忽略，不进行split的路径
        exclude : null
      }
    });
    //忽略列表数组
    var excludeList = options.split.exclude;
    if(typeof excludeList === 'string') {
        excludeList = [excludeList];
    }
    //是否是要忽略的路径
    function isExcludePath(p) {
        if(!excludeList) {return false;}
        for(var i = 0, len = excludeList.length ; i < len ; i++) {
            if(p.indexOf(excludeList[i]) >= 0) {
                return true;
            }
        }
        return false;
    }
    //如果是优化存储，使用自定义的方法
    if(options.split.turnOn) {
      //对每一个文件都进行该操作
      this.files.forEach(function(f) {
        // reset records
        grunt.option('concat-records', []);

        var pageList = f.src.filter(function(filepath) {
          // Warn on and remove invalid source files (if nonull was set).
          if (!grunt.file.exists(filepath)) {
            grunt.log.warn('Source file "' + filepath + '" not found.');
            return false;
          } else {
            return true;
          }
        });
        var limit = options.split.limit * 1024;
        pageList.forEach(function(entryPath) {
          var extname = path.extname(entryPath);
          //使用js或css处理器进行处理
          var processor = options.processors[extname] || processors[extname];
          if (!processor || options.noncmd) {
            return grunt.file.read(entryPath);
          }

          //如果是js处理器，进行文件分割
          if(extname === '.js') {
            //获取到define的数组，每一个是一个define
            var defineItems = processor({src: entryPath}, options);
            //对字节大小进行处理的临时变量
            var fileOutputList = [], sum = 0, oneFileList = [];
            //是否要进行忽略
            var exclude = isExcludePath(entryPath);
            //对每一个define进行字节计算
            defineItems.forEach(function(str) {
              sum += Buffer.byteLength(str);

              if(!exclude && sum >= limit) {
                oneFileList.push(str);
                var fileContent = oneFileList.join(grunt.util.normalizelf(options.separator));
                fileOutputList.push(options.banner + fileContent + options.footer);
                sum = 0;
                oneFileList = [];
              } else {
                oneFileList.push(str);
              }
            });
            //所有文件加起来，没有超过limit，则也写入文件中
            if(oneFileList.length) {
                var fileContent = oneFileList.join(grunt.util.normalizelf(options.separator));
                fileOutputList.push(options.banner + fileContent + options.footer);
                sum = 0;
                oneFileList = [];
            }
            //将最终结果写入到文件中
            var pathPre = path.dirname(f.dest);
            var basename = path.basename(f.dest);
            var baseNamePre = basename.replace(/\.js$/,"");
            fileOutputList.forEach(function(fileContent , i) {
                grunt.file.write(

                    exclude ?  f.dest : path.resolve(pathPre , baseNamePre + (i + 1) + ".js"),

                    fileContent);
            });
          } else {
            //css不支持split模式，我们项目中也不使用css的import
            grunt.log.warn('split mode for css files not supported: ' + entryPath);
          }
        });

      });

    //如果不是优化存储，使用seajs提供的方法
    } else {
      this.files.forEach(function(f) {
        // reset records
        grunt.option('concat-records', []);

        // Concat specified files.
        var src = options.banner + f.src.filter(function(filepath) {
              // Warn on and remove invalid source files (if nonull was set).
              if (!grunt.file.exists(filepath)) {
                grunt.log.warn('Source file "' + filepath + '" not found.');
                return false;
              } else {
                return true;
              }
            }).map(function(filepath) {
              var extname = path.extname(filepath);
              var processor = options.processors[extname] || processors[extname];
              if (!processor || options.noncmd) {
                return grunt.file.read(filepath);
              }
              return processor({src: filepath}, options);
            }).join(grunt.util.normalizelf(options.separator));

        if (/\.js$/.test(f.dest) && !options.noncmd) {
          var astCache = ast.getAst(src);
          var idGallery = ast.parse(astCache).map(function(o) {
            return o.id;
          });

          src = ast.modify(astCache, {
            dependencies: function(v) {
              if (v.charAt(0) === '.') {
                var altId = iduri.absolute(idGallery[0], v);
                if (grunt.util._.contains(idGallery, altId)) {
                  return v;
                }
              }
              var ext = path.extname(v);
              // remove useless dependencies
              if (ext && /\.(?:html|txt|tpl|handlebars|css)$/.test(ext)) return null;

              return v;
            }
          }).print_to_string(options.uglify);
        }
        // ensure a new line at the end of file
        src += options.footer;

        if (!/\n$/.test(src)) {
          src += '\n';
        }

        // Write the destination file.
        grunt.file.write(f.dest, src);

        // Print a success message.
        grunt.log.verbose.writeln('File "' + f.dest + '" created.');
        count++;
      });
      grunt.log.writeln('Concated ' + count.toString().cyan + ' files');
    }


  });
};
