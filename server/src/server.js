'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const { RoomManager } = require('./rooms');
const { registerSocketHandlers } = require('./socket');

const CLIENT_DIST = path.resolve(__dirname, '..', '..', 'client', 'dist');

/** Build the HTTP + Socket.IO server without starting it (so tests can use any port). */
function createGameServer(config) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  const indexHtml = path.join(CLIENT_DIST, 'index.html');
  if (config.serveClient && fs.existsSync(indexHtml)) {
    app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (req, res) =>
      res.type('text').send('Gadhaa server is running. Build the client (npm run build) to serve the website from here.')
    );
  }

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigins.length ? config.clientOrigins : '*',
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 10 * 1024, // gameplay messages are tiny; refuse anything large
    pingInterval: 10000,
    pingTimeout: 15000,
  });

  const manager = new RoomManager(config);
  registerSocketHandlers(io, manager, config);

  return {
    app,
    httpServer,
    io,
    manager,
    listen: (port = config.port) =>
      new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port))),
    close: () =>
      new Promise((resolve) => {
        manager.shutdown();
        io.close(() => resolve());
      }),
  };
}

module.exports = { createGameServer };
