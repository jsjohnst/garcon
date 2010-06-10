var g = require('./lib/garçon');
    
var project = new g.Project();

project.setDirectory('../my_app');

project.addSproutcore();

project.addFrameworks(
  { path:'frameworks/calendar' },
  { path:'themes/my_theme' }
);

project.setApp({ path:'apps/my_app', theme: 'my_theme' });

project.htmlHead = '<title>My App</title>';

project.htmlBody = [
  '<div id="loading">',
    '<p id="loading">',
	    'Loading…',
	  '</p>',
  '</div>'
].join('\n');

project.build();
project.run();
