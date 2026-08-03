'use strict';

const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`\n  IndiaOffers E-Mystery → ${config.siteUrl}  (port ${config.port})\n`);
});
