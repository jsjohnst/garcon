var self = this,
    l = {},
    File, Framework, sharedHandlers;

File = require('./file').File;
sharedHandlers = require('./handlers').sharedHandlers;
l.fs = require('fs');
l.path = require('path');
l.sys = require('sys');
l.qfs = require('./qfs');

self.Framework = function(options) {
  var key;
  
  this.path = null;
    
  this.buildVersion = null;
  this.combineScripts = false;
  this.combineStylesheets = true;
  this.minifyScripts = false;
  this.minifyStylesheets = false;
  this.defaultLanguage = 'english';
  this.buildLanguage = 'english';
  
  for (key in options) {
    this[key] = options[key];
  }
  
  this.pathsToExclude = [/(^\.|\/\.|tmp\/|debug\/|test_suites\/|setup_body_class_names)/];
  if (options.pathsToExclude instanceof Array) {
    this.pathsToExclude = this.pathsToExclude.concat(options.pathsToExclude);
  } else if (options.pathsToExclude instanceof RegExp) {
    options.pathsToExclude.push(options.pathsToExclude);
  }
};

Framework = self.Framework;

Framework.prototype.nameFor = function(path) {
  return path.replace(/(^apps|frameworks|^themes|([a-z]+)\.lproj|resources)\//g, '');
};

Framework.prototype.urlFor = function(path) {
  return l.path.join(this.buildVersion, this.nameFor(path));
};

Framework.prototype.name = function() {
  if (this._name === undefined) {
    this._name = this.nameFor(this.path);
  }
  
  return this._name;
};

Framework.prototype.url = function() {
  if (this._url === undefined) {
    this._url = this.urlFor(this.name());
  }
  
  return this._url;
};

Framework.prototype.shouldExcludeFile = function(path) {
  return this.pathsToExclude.reduce(function(bool, re) {
    return bool || re.test(path);
  }, false);
};

Framework.prototype.bundleDidLoadFile = function() {
  var that = this;
  
  if (this._bundleDidLoadFile === undefined) {
    this._bundleDidLoadFile = new File({
      path: l.path.join(that.path, 'bundle_did_load.js'),
      framework: that,
      content: function(callback) {
        callback(null, '; if ((typeof SC !== "undefined") && SC && SC.bundleDidLoad) SC.bundleDidLoad("' + that.name() + '");\n');
      }
    });
  }
  
  return this._bundleDidLoadFile;
};

Framework.prototype.scanFiles = function(callback) {
  var Scanner = function(framework, callback) {
    var that = this;
    
    that.count = 0;
    
    that.files = [];
        
    that.callbackIfDone = function() {
      if (that.count <= 0) callback(that.files);
    };

    that.scan = function(path) {      
      that.count += 1;
      l.fs.stat(path, function(err, stats) {
        that.count -= 1;
        
        if (err) throw err;
        
        if (stats.isDirectory()) {
          that.count += 1;
          l.fs.readdir(path, function(err, subpaths) {
            that.count -= 1;
            
            if (err) throw err;
            
            subpaths.forEach(function(subpath) {
              if (subpath[0] !== '.') {
                that.scan(l.path.join(path, subpath));
              }
            });
            
            that.callbackIfDone();
          });
          
        } else {
          if (!framework.shouldExcludeFile(path)) {
            that.files.push(new File({ path: path, framework: framework }));
          }
        }

        that.callbackIfDone();
      });
    };
  };
  
  return new Scanner(this, callback).scan(this.path);
};

Framework.prototype.computeDependencies = function(files, callback) {
  var DependencyComputer = function(files, framework, callback) {
    var that = this;

    that.count = 0;

    that.callbackIfDone = function(callback) {
      if (that.count <= 0) callback(files);
    };

    that.compute = function() {
      files.forEach(function(file) {
        that.count += 1;
        l.qfs.readFile(file.path, function(err, data) {
          var re, match, path;
          that.count -= 1;
          if (err) throw err;
          file.deps = [];
          re = new RegExp("require\\([\"'](.*?)[\"']\\)", "g");
          while (match = re.exec(data)) {
            path = match[1];
            if (!/\.js$/.test(path)) path += '.js';
            file.deps.push(framework.urlFor(l.path.join(framework.path, path)));            
          }
          that.callbackIfDone(callback, files);
        });
      });
    };
    
  };
  
  return new DependencyComputer(files, this, callback).compute();
};

Framework.prototype.sortDependencies = function(file, orderedFiles, files, recursionHistory) {
  var that = this;
  
  if (recursionHistory === undefined) recursionHistory = [];
  
  if (recursionHistory.indexOf(file) !== -1) { // infinite loop
    return;
  } else {
    recursionHistory.push(file);
  }
  
  if (orderedFiles.indexOf(file) === -1) {
    
    if (file.deps) {
      file.deps.forEach(function(url) {
        var len = files.length,
            found = false,
            i;
        
        for (i = 0; i < len; ++i) {
          if (files[i].url() === url) {
            found = true;
            that.sortDependencies(files[i], orderedFiles, files, recursionHistory);
            break;
          }
        }
        
        if (!found) {
          l.sys.puts('WARNING: ' + url + ' is required in ' + file.url() + ' but does not exists.');
        }
      });
    }
    
    orderedFiles.push(file);
  }
};

Framework.prototype.orderScripts = function(scripts, callback) {
  var that = this;
    
  that.computeDependencies(scripts, function(scripts) {    
    var orderScripts = [],
        coreJsPath = l.path.join(that.path, 'core.js'),
        coreJs, i;
    
    // strings.js first
    scripts.forEach(function(script) {
      if (/strings\.js$/.test(script.path)) {
        that.sortDependencies(script, orderScripts, scripts);
      }
      if (script.path === coreJsPath) {
        coreJs = script;
      }
    });

    // then core.js and its dependencies
    if (coreJs) {
      that.sortDependencies(coreJs, orderScripts, scripts);
      scripts.forEach(function(script) {
        if (script.deps && script.deps.indexOf(coreJs.path) !== -1) {
          that.sortDependencies(script, orderScripts, scripts);
        }
      });
    }

    // then the rest
    scripts.forEach(function(script) {
      that.sortDependencies(script, orderScripts, scripts);
    });

    while (scripts.shift()) {}
    while (i = orderScripts.shift()) { scripts.push(i); }
    
    callback();
  });
};


Framework.prototype.build = function(callback) {
  var that = this;
  
  var selectLanguageFiles = function(files) {
    var tmpFiles = {},
        file;
    
    files.forEach(function(file1) {
      var file2 = tmpFiles[file1.url()],
          file1Language = file1.language();
      
      if (file1Language === null || file1Language === that.buildLanguage || file1Language === that.defaultLanguage) {
        if (file2 === undefined) {
          tmpFiles[file1.url()] = file1;
        } else if (file1Language === that.buildLanguage) {
          tmpFiles[file1.url()] = file1;
        }
      }
    });
    
    files = [];
    for (file in tmpFiles) {
      files.push(tmpFiles[file]);
    }
    
    return files;
  };
  
  var buildStylesheets = function(files) {
    var tmpFiles = [],
        handlers = [],
        handler, file;
    
    handlers.push('ifModifiedSince', 'contentType');
    if (that.minifyScripts === true) {
      handlers.push('minify');
    }
    handlers.push(['rewriteStatic', "url('%@')"], 'join', 'file');
    
    handler = sharedHandlers.build(handlers);
    
    if (that.combineStylesheets === true) {
      files.forEach(function(file) {
        if (file.isStylesheet()) {
          tmpFiles.push(file);
        }
      });
      file = new File({
        path: that.path + '.css',
        framework: that,
        handler: handler,
        children: tmpFiles
      });
      that.server.files[file.url()] = file;
    } else {
      files.forEach(function(file) {
        if (file.isStylesheet()) {
          file.handler = handler;
          that.server.files[file.url()] = file;
        }
      });
    }
    
  };
  
  var buildScripts = function(files, callback) {
    var tmpFiles = [],
        handlers = [],
        bundleDidLoadFile = that.bundleDidLoadFile(),
        handler, file;
    
    that.orderedScripts = [];
    
    handlers.push('ifModifiedSince', 'contentType');
    if (that.minifyScripts === true) {
      handlers.push('minify');
    }
    handlers.push('rewriteSuper', 'rewriteStatic', 'join', 'file');
    
    handler = sharedHandlers.build(handlers);
    
    files.forEach(function(file) {
      if (file.isScript()) {
        if (that.combineScripts !== true) {
          file.handler = handler;
          that.server.files[file.url()] = file;
        }
        tmpFiles.push(file);
      }
    });
    
    that.orderScripts(tmpFiles, function() {
      tmpFiles.push(bundleDidLoadFile);

      if (that.combineScripts === true) {
        file = new File({
          path: that.path + '.js',
          framework: that,
          handler: handler,
          children: tmpFiles
        });
        that.server.files[file.url()] = file;
        that.orderedScripts = [file];
      } else {
        bundleDidLoadFile.handler = sharedHandlers.build(['contentType', 'file']);
        that.server.files[bundleDidLoadFile.url()] = bundleDidLoadFile;
        that.orderedScripts = tmpFiles;
      }
      
      callback();
    });
    
  };
  
  var buildResources = function(files) {
    var handler = sharedHandlers.build(['ifModifiedSince', 'contentType', 'file']);
    
    files.forEach(function(file) {
      if (file.isResource()) {
        file.handler = handler;
        that.server.files[file.url()] = file;
      }
    });
  };
  
  var buildTests = function(files) {
    var handler = sharedHandlers.build(['contentType', 'rewriteFile', 'wrapTest', 'file']);
    
    files.forEach(function(file) {
      if (file.isTest()) {
        file.handler = handler;
        that.server.files[file.url()] = file;
      }
    });
  };
  
  that.scanFiles(function(files) {
    files = selectLanguageFiles(files);
    that.files = files;
    
    buildStylesheets(files);
    buildResources(files);
    buildTests(files);
    buildScripts(files, function() {
      if (callback) callback();
    });
    
  });
};
