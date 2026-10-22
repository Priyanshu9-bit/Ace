'use strict';
const { io: connect } = require('socket.io-client');
const { loadConfig } = require('../src/config');
const { createGameServer } = require('../src/server');

async function startTestServer(overrides = {}) {
  const config = {
    ...loadConfig({}),
    port: 0,
    serveClient: false,
    trickPauseMs: 5,
    autoplayDelayMs: 150,
    lobbyGraceMs: 150,
    rateLimitMax: 10000,
    ...overrides,
  };
  const server = createGameServer(config);
  const port = await server.listen(0);
  return { server, port, url: `http://127.0.0.1:${port}` };
}

/** A simulated player: wraps a socket, records every `state` it receives. */
class TestClient {
  constructor(url, label) {
    this.label = label;
    this.url = url;
    this.states = [];
    this.view = null;
    this.session = null;
    this.replaced = false;
    this._connect();
  }

  _connect() {
    this.socket = connect(this.url, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('state', (v) => {
      this.view = v;
      this.states.push(v);
      this._waiters = (this._waiters || []).filter((w) => !w.check(v) || (w.resolve(v), false));
    });
    this.socket.on('session:replaced', () => { this.replaced = true; });
    this.ready = new Promise((res, rej) => {
      this.socket.once('connect', res);
      this.socket.once('connect_error', rej);
    });
  }

  emit(event, payload) {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  async create(name, maxPlayers, avatar) {
    await this.ready;
    const res = await this.emit('room:create', { name, maxPlayers, avatar });
    if (res.ok) this.session = { code: res.code, token: res.token, playerId: res.playerId };
    return res;
  }

  async join(code, name, avatar) {
    await this.ready;
    const res = await this.emit('room:join', { code, name, avatar });
    if (res.ok) this.session = { code: res.code, token: res.token, playerId: res.playerId };
    return res;
  }

  async spectate(code, name, avatar) {
    await this.ready;
    const res = await this.emit('room:spectate', { code, name, avatar });
    if (res.ok) this.session = { code: res.code, token: res.token, playerId: res.playerId, isSpectator: true };
    return res;
  }

  /** Resolves with the next/current view satisfying `check`. */
  waitFor(check, ms = 5000) {
    if (this.view && check(this.view)) return Promise.resolve(this.view);
    return new Promise((resolve, reject) => {
      const waiter = { check, resolve };
      this._waiters = [...(this._waiters || []), waiter];
      setTimeout(() => reject(new Error(`${this.label}: timed out waiting for state`)), ms).unref?.();
    });
  }

  close() {
    this.socket.close();
  }
}

module.exports = { startTestServer, TestClient };
