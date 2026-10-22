'use strict';
const { loadConfig } = require('./config');
const { createGameServer } = require('./server');

const config = loadConfig();
const server = createGameServer(config);

server.listen().then((port) => {
  console.log(`[gadha] listening on http://localhost:${port}  (max ${config.maxPlayers} players per room)`);
});

function shutdown() {
  server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
