// api/index.js - Main handler for Vercel
const app = require('./server');

// This is crucial for Vercel to handle Express apps
module.exports = app;