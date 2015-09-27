var path = require('path');
var cmd = require('cmd-util');
var ast = cmd.ast;
var iduri = cmd.iduri;
var RevvedFinder = require("./revvedfinder");


exports.init = function(grunt) {

  var finder = new RevvedFinder(function(p) {
    return grunt.file.expand({
      filter: 'isFile'
    }, p);
  });
  
  var exports = {};
  
  var imgreg = /(?:url\(\s*)['"]?([^'"\)]+)['"]?\s*\)?/gm;
  
  exports.jsConcat = function(fileObj, options) {
    var data = grunt.file.read(fileObj.src);

    var meta = ast.parseFirst(data);
    var records = grunt.option('concat-records');

    if (grunt.util._.contains(records, meta.id)) {
      return '';
    }
    records.push(meta.id);

    if (options.include === 'self') {
      return data;
    }

    var pkgPath = path.resolve('package.json');
    if (grunt.file.exists(pkgPath)) {
      var pkg = grunt.file.readJSON(pkgPath);
      if (pkg.spm && pkg.spm.styleBox === true) {
        options.styleBox = true;
      }
    }

    var defineList = meta.dependencies.map(function(dep) {
      if (dep.charAt(0) === '.') {
        var id = iduri.absolute(meta.id, dep);
        if (grunt.util._.contains(records, id)) {
          return '';
        }
        records.push(id);

        var fpath = path.join(path.dirname(fileObj.src), dep);
        if (!/\.js$/.test(fpath)) fpath += '.js';
        if (!grunt.file.exists(fpath)) {
          if (!/\{\w+\}/.test(fpath)) {
            grunt.log.warn('file ' + fpath + ' not found');
          }
          return '';
        }

        var astCache = ast.getAst(grunt.file.read(fpath));
        var srcId = ast.parseFirst(astCache).id;
        astCache = ast.modify(astCache,  function(v) {
          if (v.charAt(0) === '.') {
            return iduri.absolute(srcId, v);
          }
          return v;
        });

        return astCache.print_to_string(options.uglify);

      } else if ((/\.css$/.test(dep) && options.css2js) || options.include === 'all') {
        var fileInPaths;

        options.paths.some(function(basedir) {
          var fpath = path.join(basedir, dep);
          if (!/\.js$/.test(dep)) {
            fpath += '.js';
          }
          if (grunt.file.exists(fpath)) {
            fileInPaths = fpath;
            return true;
          }
        });

        if (!fileInPaths) {
          grunt.log.warn('file ' + dep + ' not found');
        } else {
          var data = grunt.file.read(fileInPaths);
          data = data.replace(imgreg , function($0,$1) {
              var result_src;
              options.imageRoot.some(function(basedir) {
              $1 = $1.replace(/^\// , '');
              var result = finder.find($1 , basedir);
              if(result !== $1) {
                result_src = result;
                return true;
              }
              return false;
            });
              if(result_src) {
                return "url(/" + result_src + ")";
              } 
              return $0;
          });
          return data;
        }
      }
      return '';
    });

    if(options.split.turnOn) {
      defineList.unshift(data);
      return defineList;
    } else {
      defineList.unshift(data);
      return defineList.join(grunt.util.normalizelf(options.separator));
    }
  };

  return exports;
};
