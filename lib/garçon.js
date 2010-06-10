/*globals process*/

var
  self = this,
  l = {},
  File, Framework, Project, Handlers, sharedHandlers;

require('./date');
require('./string');
l.fs = require('fs');
l.http = require('http');
l.path = require('path');
l.sys = require('sys');
l.url = require('url');


/* File */

self.File = function(options) {
  var key;
  
  this.path = null;
  this.framework = null;
  this.handler = null;
  this.children = null;
  
  for (key in options) {
    this[key] = options[key];
  }
};

File = self.File;

File.prototype.extname = function() {
  if (this._extname === undefined) {
    this._extname = l.path.extname(this.path);
  }
  
  return this._extname;
};

File.prototype.url = function() {
  if (this._url === undefined) {
    this._url = this.framework.urlFor(this.path);
  }
  
  return this._url;
};

File.prototype.language = function() {
  var match;
  
  if (this._language === undefined) {
    match = /([a-z]+)\.lproj\//.exec(this.path);
    this._language = match === null ? null : match[1];
  }
  
  return this._language;
};

File.prototype.isStylesheet = function() {
  return this.extname() === '.css';
};

File.prototype.isScript = function() {
  return this.extname() === '.js';
};

File.prototype.isResource = function() {
  return ['.png', '.jpg', '.gif'].some(function(extname) {
    return extname === this.extname();
  }, this);
};

File.prototype.content = function(callback) {
  l.fs.readFile(this.path, callback);
};

/* Framework */

self.Framework = function(options) {
  var key;
  
  this.path = null;
  this.project = null;
  
  this.buildVersion = new Date().getTime();
  this.combineScripts = false;
  this.combineStylesheets = true;
  this.preferredLanguage = 'english';
  this.buildLanguage = 'english';
  
  for (key in options) {
    this[key] = options[key];
  }
};

Framework = self.Framework;

Framework.prototype.nameFor = function(path) {
  return path.replace(/(^apps|frameworks|^themes|([a-z]+)\.lproj)\//g, '');
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

Framework.prototype.files = function(callback) {
  var Scanner = function(framework, callback) {
    var that = this;
    
    that.count = 0;
    
    that.files = [];
    
    that.pathsToExclude = /(^\.|\/\.|tmp\/|tests\/|test_suites\/|setup_body_class_names)/;
    
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
          if (!that.pathsToExclude.test(path)) {
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
        l.fs.readFile(file.path, function(err, data) {
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

Framework.prototype.orderScripts = function(scripts) {
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
    that.sortDependencies(coreJs, orderScripts, scripts);
    scripts.forEach(function(script) {
      if (script.deps.indexOf(coreJs.path) !== -1) {
        that.sortDependencies(script, orderScripts, scripts);
      }
    });

    // then the rest
    scripts.forEach(function(script) {
      that.sortDependencies(script, orderScripts, scripts);
    });

    while (scripts.shift()) {}
    while (i = orderScripts.shift()) { scripts.push(i); }
  });
};


Framework.prototype.build = function() {
  var that = this;
  
  var selectLanguageFiles = function(files) {
    var tmpFiles = {},
        file;
    
    files.forEach(function(file1) {
      var file2 = tmpFiles[file1.url()],
          file1Language = file1.language();
      
      if (file1Language === null || file1Language === that.buildLanguage || file1Language === that.preferredLanguage) {
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
        handler, file;
    
    handler = sharedHandlers.build('ifModifiedSince', 'contentType', ['rewriteStatic', "url('%@')"], 'join', 'file');
    
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
      that.project.files[file.url()] = file;
    } else {
      files.forEach(function(file) {
        if (file.isStylesheet()) {
          file.handler = handler;
          that.project.files[file.url()] = file;
        }
      });
    }
    
  };
  
  var buildScripts = function(files) {
    var tmpFiles = [],
        handler, file;
    
    that.orderedScripts = [];
    
    handler = sharedHandlers.build('ifModifiedSince', 'contentType', 'rewriteSuper', 'rewriteStatic', 'join', 'file');
    
    files.forEach(function(file) {
      if (file.isScript()) {
        if (that.combineScripts !== true) {
          file.handler = handler;
          that.project.files[file.url()] = file;
        }
        tmpFiles.push(file);
      }
    });
    
    that.orderScripts(tmpFiles, that);
    
    if (that.combineScripts === true) {
      file = new File({
        path: that.path + '.js',
        framework: that,
        handler: handler,
        children: tmpFiles
      });
      that.project.files[file.url()] = file;
      that.orderedScripts = [file];
    } else {
      that.orderedScripts = tmpFiles;
    }
    
  };
  
  var buildResources = function(files) {
    var handler = sharedHandlers.build('ifModifiedSince', 'contentType', 'file');
    
    files.forEach(function(file) {
      if (file.isResource()) {
        file.handler = handler;
        that.project.files[file.url()] = file;
      }
    });
  };
  
  that.files(function(files) {
    files = selectLanguageFiles(files);
    
    buildStylesheets(files);
    buildScripts(files);
    buildResources(files);
  });
};

/* Project */

self.Project = function(options) {
  var key;
    
  this.htmlHead = null;
  this.htmlStylesheets = null;
  this.htmlBody = null;
  this.htmlScripts = null;
  this.port = 8000;
  this.proxyHost = '127.0.0.1';
  this.proxyPort = 3000;
  this.proxyPrefix = '';
  
  for (key in options) {
    this[key] = options[key];
  }
};

Project = self.Project;

Project.prototype.addFramework = function(framework) {
  if (this.frameworks === undefined) {
    this.frameworks = [];
  }
  
  if (!(framework instanceof Framework)) {
    framework = new Framework(framework);
  }
  
  framework.project = this;
  this.frameworks.push(framework);
  
  return framework;
};

Project.prototype.addFrameworks = function() {
  var args = Array.prototype.slice.call(arguments);
  args.forEach(function(framework) {
    this.addFramework(framework);
  }, this);  
};

Project.prototype.addSproutcore = function() {
  this.addFrameworks(
    { path: 'frameworks/sproutcore/frameworks/bootstrap', combineScripts: true },
    { path: 'frameworks/sproutcore/frameworks/runtime', combineScripts: true },
    { path: 'frameworks/sproutcore/frameworks/foundation', combineScripts: true },
    { path: 'frameworks/sproutcore/frameworks/datastore', combineScripts: true },
    { path: 'frameworks/sproutcore/frameworks/desktop', combineScripts: true },
    { path: 'frameworks/sproutcore/frameworks/animation', combineScripts: true }
  );
};

Project.prototype.setApp = function(app) {
  this.app = this.addFramework(app);
};

Project.prototype.setDirectory = function(path) {
  process.chdir(path);
};

Project.prototype.rootContent = function() {
  var that = this;
  
  return function(callback) {
    var html = [],
        url, file;

    html.push(
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
        '<meta http-equiv="Content-type" content="text/html; charset=utf-8" />',
        '<meta http-equiv="X-UA-Compatible" content="IE=8" />',
        '<meta http-equiv="Content-Script-Type" content="text/javascript" />');

    if (that.htmlHead !== null) html.push(that.htmlHead);
    if (that.htmlStylesheets !== null) html.push(that.htmlStylesheets);

    that.frameworks.forEach(function(framework) {
      for (url in that.files) {
        file = that.files[url];
        if (file.framework === framework && file.extname() === '.css') {
          html.push('<link href="' + url + '" rel="stylesheet" type="text/css" />');
        }
      }
    });

    html.push(
      '</head>',
      '<body class="' + that.app.theme + ' focus">'
    );

    if (that.htmlBody !== null) html.push(that.htmlBody);
    if (that.htmlScripts !== null) html.push(that.htmlScripts);

    that.frameworks.forEach(function(framework) {
      framework.orderedScripts.forEach(function(script) {
        html.push('<script type="text/javascript" src="' + script.url() + '"></script>');
      });

      if (/bootstrap/.test(framework.path)) {
        html.push(
          '<script type="text/javascript">',
            'String.preferredLanguage = "' + that.app.preferredLanguage + '";',
            'if (SC.setupBodyClassNames) SC.setupBodyClassNames();',
          '</script>'
        );
      } else {
        html.push(
          '<script type="text/javascript">',
            '; if ((typeof SC !== "undefined") && SC && SC.bundleDidLoad) SC.bundleDidLoad("' + framework.name() + '");',
          '</script>'
        );
      }

    });

    html.push(
    	  '</body>',
      '</html>'
    );

    html = html.join('\n');

    callback(null, html);
  };
};

Project.prototype.buildRoot = function() {
  var handler, file;
  
  handler = sharedHandlers.build('cache', 'contentType', 'file');
  
  file = new File({ path: '', handler: handler, framework: this.app, content: this.rootContent() });
  this.files[''] = file;
};

Project.prototype.build = function() {
  this.files = {};
  
  this.frameworks.forEach(function(framework) {
    framework.build();
  });
  
  this.buildRoot();
};

Project.prototype.run = function() {
  
  var that = this;
  
  var serve = function(file, request, response) {
    file.handler.handle(file, request, function(r) {
      var headers = {},
          status = 200;

      if (r.contentType !== undefined) headers['Content-Type'] = r.contentType;
      if (r.lastModified !== undefined) headers['Last-Modified'] = r.lastModified.format('httpDateTime');
      if (r.status !== undefined) status = r.status;

      response.writeHead(status, headers);

      if (r.data !== undefined) response.write(r.data, 'utf8');

      response.end();
    });
  };
  
  var proxy = function(request, response) {
    var body = '';
    
    request.addListener('data', function(chunk) {
      body += chunk;
    });

    request.addListener('end', function() {
      var proxyClient, proxyRequest,
          url = request.url;

      if (that.proxyPrefix.length > 0 && url.indexOf(that.proxyPrefix) < 0) {
        url = that.proxyPrefix + url;
      }

      proxyClient = l.http.createClient(that.proxyPort, that.proxyHost);

      proxyClient.addListener('error', function(err) {
        l.sys.puts('ERROR: "' + err.message + '" for proxy request on ' + that.proxyHost + ':' + that.proxyPort);
        response.writeHead(404);
        response.end();
      });

      proxyRequest = proxyClient.request(request.method, url, request.headers);

      if (body.length > 0) {
        proxyRequest.write(body);
      }

      proxyRequest.addListener('response', function(proxyResponse) {
        response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
        proxyResponse.addListener('data', function(chunk) {
          response.write(chunk);
        });
        proxyResponse.addListener('end', function() {
          response.end();
        });
      });

      proxyRequest.end();
    });
  };
  
  l.http.createServer(function (request, response) {
    var path = l.url.parse(request.url).pathname.slice(1),
        file = that.files[path];
    
    if (file === undefined) {
      l.sys.puts('Proxying ' + request.url);
      proxy(request, response);
    } else {
      serve(file, request, response);
    }
  }).listen(that.port);
  
  l.sys.puts('Server started on http://localhost:' + that.port);
};

/* Handler */

self.Handlers = function(options) {  
  this.handlers = {};
};

Handlers = self.Handlers;

Handlers.prototype.add = function(name, handler) {
  this.handlers[name] = handler;
};

Handlers.prototype.build = function() {
  var len = arguments.length,
      i, name, args, first, current, next;
      
  for (i = 0; i < len; ++i) {
    args = arguments[i];
    
    if (args instanceof Array) {
      name = args.shift();
    } else {
      name = args;
      args = [];
    }
    
    next = this.handlers[name].apply(this, args);

    if (first === undefined) {
      first = next;
    } else {
      current.next = next;
    }
    current = next;
  }
  
  return first;
};

sharedHandlers = self.sharedHandlers = new self.Handlers();

sharedHandlers.add('ifModifiedSince', function() {
  var that = {};
  
  that.handleWithStats = function(file, request, stats, callback) {
    if (request.headers['if-modified-since'] === undefined || stats.mtime > Date.parse(request.headers['if-modified-since'])) {
      that.next.handle(file, request, function(response) {
        response.lastModified = stats.mtime;
        callback(response);
      });
    } else {
      callback({ status: 304 });
    }
  };
  
  that.handle = function(file, request, callback) {
    l.fs.stat(file.path, function(err, stats) {
      if (err) {
        l.fs.stat(l.path.dirname(file.path), function(err, stats) {
          if (err) {
            throw err;
          } else {
            that.handleWithStats(file, request, stats, callback);
          }
        });
      } else {
        that.handleWithStats(file, request, stats, callback);
      }
    });
  };

  return that;
});

sharedHandlers.add('cache', function() {
  var that = {};
  
  that.cache = {};
  
  that.handle = function(file, request, callback) {
    if (that.cache[file.path] === undefined) {
      that.next.handle(file, request, function(response) {
        that.cache[file.path] = response;
        callback(response);
      });
    } else {
      callback(that.cache[file.path]);
    }
  };
  
  return that;
});
  
sharedHandlers.add('contentType', function(contentType) {
  var that = {};
  
  that.contentType = contentType;
  
  that.contentTypes = {
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.json': 'application/json'
  };
  
  that.handle = function(file, request, callback) {
    that.next.handle(file, request, function(response) {
      response.contentType = that.contentType === undefined ? that.contentTypes[file.extname()] : that.contentType;
      callback(response);
    });
  };

  return that;
});

sharedHandlers.add('rewriteSuper', function() {
  var that = {};

  that.handle = function(file, request, callback) {
    that.next.handle(file, request, function(response) {
      if (/sc_super\(\s*.+\s*\)/.test(response.data)) {
        l.sys.puts('ERROR in ' + file.path + ': sc_super() should not be called with arguments. Modify the arguments array instead.');
      }
      response.data = response.data.replace(/sc_super\(\s*\)/g, 'arguments.callee.base.apply(this,arguments)');
      callback(response);
    });
  };

  return that;
});

sharedHandlers.add('rewriteStatic', function(format) {
  var that = {};
  
  that.format = format || "'%@'";

  that.handle = function(file, request, callback) {
    that.next.handle(file, request, function(response) {
      var re = new RegExp("sc_static\\(\\s*['\"](.+)['\"]\\s*\\)"),
          dirname = file.framework.url();
      
      response.data = response.data.gsub(re, function(match) {
        var path = l.path.join(dirname, match[1]);
        
        if (!file.framework.project.files[path]) {
          ['.png', '.gif', '.jpg'].some(function(extname) {
            var alternatePath = path + extname;
            if (file.framework.project.files[alternatePath]) {
              path = alternatePath;
              return true;
            }
          });         
          if (!file.framework.project.files[path]) {
            l.sys.puts('WARNING: ' + path + ' referenced in ' + file.path + ' but was not found.');
          }
        }
        
        return that.format.replace('%@', l.path.join('/', path));
      });
      callback(response);
    });
  };

  return that;
});

sharedHandlers.add('join', function() {
  var that = {};
    
  that.handle = function(file, request, callback) {
    var data = [],
        files, count;
        
    if (file.children === null) {
      files = [file];
    } else {
      files = file.children;
    }
    
    count = files.length;
    
    if (count === 0) {
      callback({ data: '' });
      
    } else {
      files.forEach(function(file, i) {
        that.next.handle(file, request, function(d) {
          data[i] = d.data;
          count -= 1;
          if (count === 0) {
            callback({ data: data.join('\n') });
          }
        });
      });
    }
  };

  return that;
});

sharedHandlers.add('file', function() {    
  var that = {};

  that.handle = function(file, request, callback) {
    file.content(function(err, data) {
      if (err) {
        throw err;
      } else {
        callback({ data: data.length === 0 ? '' : data });
      }
    });
  };

  return that;
});
