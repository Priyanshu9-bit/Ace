'use strict';
const { MIN_PLAYERS, ABSOLUTE_MAX_PLAYERS } = require('./engine/cards');

function int(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function loadIceServers(env) {
  if (env.ICE_SERVERS) {
    try {
      const parsed = JSON.parse(env.ICE_SERVERS);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [{ urls: env.ICE_SERVERS.split(',').map((s) => s.trim()).filter(Boolean) }];
    }
  }
  const servers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  if (env.TURN_URL) {
    const urls = env.TURN_URL.split(',').map((s) => s.trim()).filter(Boolean);
    const entry = { urls };
    if (env.TURN_USERNAME) entry.username = env.TURN_USERNAME;
    if (env.TURN_CREDENTIAL) entry.credential = env.TURN_CREDENTIAL;
    servers.push(entry);
  }
  return servers;
}

/** All deployment settings come from environment variables (see README). */
function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 3001, { min: 0, max: 65535 }),
    // Comma-separated list of allowed browser origins for cross-origin setups.
    // Leave empty when the server also serves the client (same origin).
    clientOrigins: (env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
    maxPlayers: int(env.MAX_PLAYERS, 8, { min: MIN_PLAYERS, max: ABSOLUTE_MAX_PLAYERS }),
    trickPauseMs: int(env.TRICK_PAUSE_MS, 1800, { min: 0, max: 10000 }),
    autoplayDelayMs: int(env.AUTOPLAY_DELAY_MS, 20000, { min: 0, max: 600000 }),
    lobbyGraceMs: int(env.LOBBY_GRACE_MS, 30000, { min: 0, max: 600000 }),
    roomIdleMs: int(env.ROOM_IDLE_MS, 10 * 60 * 1000, { min: 1000 }),
    rateLimitMax: int(env.RATE_LIMIT_MAX, 1000, { min: 10, max: 20000 }),
    serveClient: env.SERVE_CLIENT !== 'false',
    iceServers: loadIceServers(env),
  };
}

module.exports = { loadConfig };
