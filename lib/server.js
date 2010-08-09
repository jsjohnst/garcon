/*globals process*/

var self = this,
    l = {},
    App, Framework, Server;

require('./date');
App = require('./app').App;
Framework = require('./framework').Framework;
l.http = require('http');
l.sys = require('sys');
l.url = require('url');

self.Server = function(options) {
  var key;
  
  this.port = 8000;
  this.hostname = null;
  this.proxyHost = '127.0.0.1';
  this.proxyPort = 3000;
  this.proxyPrefix = '';
  
  this.apps = [];
  this.files = [];
  
  for (key in options) {
    this[key] = options[key];
  }
};

Server = self.Server;

Server.prototype.addApp = function(app) {
  if (!(app instanceof App)) {
    app = new App(app);
  }
  
  app.server = this;
  
  this.apps.push(app);
  return app;
};

Server.prototype.sproutcoreFrameworks = function() {
  if (this._sproutcoreFrameworks === undefined) {
    this._sproutcoreFrameworks = [
      new Framework({ server: this, path: 'frameworks/sproutcore/frameworks/bootstrap', combineScripts: true }),
      new Framework({ server: this, path: 'frameworks/sproutcore/frameworks/runtime', combineScripts: true }),
      new Framework({ server: this, path: 'frameworks/sproutcore/frameworks/foundation', combineScripts: true }),
      new Framework({ server: this, path: 'frameworks/sproutcore/frameworks/datastore', combineScripts: true }),
      new Framework({ server: this, path: 'frameworks/sproutcore/frameworks/desktop', combineScripts: true }),
      new Framework({ server: this, path: 'frameworks/sproutcore/frameworks/animation', combineScripts: true })
    ];
  }
  
  return this._sproutcoreFrameworks;
};

Server.prototype.setDirectory = function(path) {
  process.chdir(path);
};

Server.prototype.run = function() {
  
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
  }).listen(that.port, that.hostname);
  
  l.sys.puts('Server started on http://localhost:' + that.port);
};
