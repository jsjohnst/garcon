var g = require('./lib/garçon'),
    server = new g.Server(),
    myApp;

myApp = server.addApp({ name: 'myApp', theme: 'my_theme' });

myApp.addSproutcore();

myApp.addFrameworks(
  { path: 'frameworks/calendar' },
  { path:'themes/my_theme' },
  { path: 'apps/ct', buildLanguage: 'french', preferredLanguage: 'french' }
);

myApp.htmlHead = '<title>My App</title>';

myApp.htmlBody = [
  '<div id="loading">',
    '<p id="loading">',
	    'Loading…',
	  '</p>',
  '</div>'
].join('\n');

myApp.build();
server.run();
