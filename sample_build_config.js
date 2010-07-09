var g = require('./lib/garçon'),
    server = new g.Server(),
    myApp;

myApp = server.addApp({
  name: 'myApp',
  theme: 'my_theme',
  buildLanguage: 'french',
  combineScripts: true,
  combineStylesheets: true,
  minifyScripts: true,
  minifyStylesheets: true
});

myApp.addSproutcore();

myApp.addFrameworks(
  { path: 'frameworks/calendar' },
  { path: 'themes/my_theme' },
  { path: 'apps/my_app', buildLanguage: 'french' }
);

myApp.htmlHead = '<title>My App</title>';

myApp.htmlBody = [
  '<div id="loading">',
    '<p id="loading">',
	    'Loading…',
	  '</p>',
  '</div>'
].join('\n');

myApp.build(function() {
  myApp.save();
});
