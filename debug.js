//w2api - Version 0.0.1
const options = {};
const path = require('path'); 
options.port = parseInt(path.basename(path.resolve(__dirname, '.')));
require('total.js/debug')(options);

