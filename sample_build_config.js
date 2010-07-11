var g = require('./lib/garçon'),
    server, myApp;
    
// create a server which will listen on port 8000 by default
server = new g.Server();

// adding an application named 'myApp' tells the server to respond to
// the /myApp url and to create a myApp.html file when saving
myApp = server.addApp({
  name: 'myApp',
  theme: 'my_theme',
  buildLanguage: 'french',
  combineScripts: true,
  combineStylesheets: true,
  minifyScripts: true,
  minifyStylesheets: true
});

// myApp needs SproutCore to run
myApp.addSproutcore();

// add other dependencies
myApp.addFrameworks(
  
  // a third party framework
  { path: 'frameworks/calendar' },
  
  // a custom theme
  { path: 'themes/my_theme' },
  
  // finally, the sources for myApp must be added as well
  { path: 'apps/my_app' }
);

// add some html for inside the <head> tag
myApp.htmlHead = '<title>My App</title>';

// add some html for inside the <body> tag
myApp.htmlBody = [
  '<p id="loading">',
    'Loading…',
  '</p>'
].join('\n');

// build the app and, when done, save it to the disk
myApp.build(function() {
  myApp.save();
});
