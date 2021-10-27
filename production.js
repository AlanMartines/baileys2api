//w2api - Version 0.0.1
const options = {};
const path = require('path'); 
options.port = parseInt(path.basename(path.resolve(__dirname, '.')));

// options.ip = '127.0.0.1';
// options.port = 8002;
// options.config = { name: 'W2API.js' };
// options.sleep = 3000;

require('total.js').http('release', options);