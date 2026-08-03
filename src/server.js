'use strict';

const app = require('./app');
const config = require('./config');
const db = require('./db');

const server = app.listen(config.port, () => {
  console.log(`\n  IndiaOffers E-Mystery → ${config.siteUrl}  (port ${config.port})\n`);
});

// systemd sends SIGTERM on restart/deploy. Finish in-flight requests and close
// SQLite cleanly so a WAL checkpoint isn't left behind mid-write.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${signal} received — draining connections…`);

  const forceExit = setTimeout(() => {
    console.error('[server] Drain timed out after 10s — forcing exit.');
    process.exit(1);
  }, 10000).unref();

  server.close(err => {
    clearTimeout(forceExit);
    if (err) {
      console.error('[server] Error while closing:', err);
      process.exit(1);
    }
    try {
      db.sqlite.close();
    } catch (e) {
      console.error('[server] Error closing database:', e);
    }
    console.log('[server] Shutdown complete.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', err => {
  console.error('[server] Unhandled promise rejection:', err);
});
process.on('uncaughtException', err => {
  console.error('[server] Uncaught exception:', err);
  shutdown('uncaughtException');
});
