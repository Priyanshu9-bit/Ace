'use strict';
/**
 * RoomManager - owns every room, the players inside them, and all timers
 * (round pause, auto-play for absent players, lobby grace, idle cleanup).
 * It never touches sockets directly: whenever something changes it calls
 * `notify(room)` and the socket layer sends each player their private view.
 */
const crypto = require('node:crypto');
const { GadhaError } = require('./errors');
const { GadhaGame } = require('./engine/game');
const { MIN_PLAYERS } = require('./engine/cards');
const { cleanName, cleanRoomCode, cleanToken, cleanMaxPlayers, cleanAvatar } = require('./validate');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 - easy to read aloud
const CODE_LENGTH = 5;
const LEFT_AUTOPLAY_MS = 800; // a player who left mid-game is auto-played quickly

const newId = () => crypto.randomBytes(6).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

class RoomManager {
  /**
   * @param {object} config see config.js
   * @param {(room:object)=>void} notify called after every state change
   */
  constructor(config, notify = () => {}) {
    this.config = config;
    this.notify = notify;
    this.rooms = new Map();
    this._sweeper = setInterval(() => this._sweepIdleRooms(), Math.min(60000, Math.max(1000, config.roomIdleMs)));
    this._sweeper.unref();
  }

  shutdown() {
    clearInterval(this._sweeper);
    for (const room of this.rooms.values()) this._clearTimers(room);
    this.rooms.clear();
  }

  // ---------- lookup ----------

  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  // ---------- joining / leaving ----------

  createRoom(rawName, socketId, rawMaxPlayers, rawAvatar) {
    const name = cleanName(rawName);
    const avatar = cleanAvatar(rawAvatar);
    const configuredMax = this.config.maxPlayers || 8;
    const maxPlayers = cleanMaxPlayers(rawMaxPlayers, MIN_PLAYERS, configuredMax) || configuredMax;
    let code;
    do code = randomCode();
    while (this.rooms.has(code));

    const player = this._newPlayer(name, socketId, avatar);
    const room = {
      code,
      hostId: player.id,
      maxPlayers,
      players: [player],
      spectators: [],
      iceServers: this.config.iceServers || [],
      turnStartedAt: null,
      turnTimeoutMs: this.config.autoplayDelayMs,
      phase: 'lobby', // 'lobby' | 'playing' | 'finished'
      game: null,
      guideMap: {}, // [safePlayerId]: targetPlayerId (safe player viewing target player cards)
      guideRequests: {}, // [targetPlayerId]: { fromId, fromName, fromAvatar, targetId, targetName, timestamp }
      stats: {}, // { [playerId]: { gadhaCount: 0, winCount: 0, gamesPlayed: 0 } }
      gamesPlayed: 0,
      timers: {},
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    this._changed(room);
    return { room, player };
  }

  joinRoom(rawCode, rawName, socketId, rawAvatar) {
    const room = this._mustGetRoom(cleanRoomCode(rawCode));
    const name = cleanName(rawName);
    const avatar = cleanAvatar(rawAvatar);
    if (room.phase !== 'lobby') throw new GadhaError('GAME_IN_PROGRESS', 'That game has already started');
    const limit = room.maxPlayers || this.config.maxPlayers;
    if (room.players.length >= limit) throw new GadhaError('ROOM_FULL', 'That room is full');

    const player = this._newPlayer(this._uniqueName(room, name), socketId, avatar);
    room.players.push(player);
    this._changed(room);
    return { room, player };
  }

  joinSpectator(rawCode, rawName, socketId, rawAvatar) {
    const room = this._mustGetRoom(cleanRoomCode(rawCode));
    const name = cleanName(rawName);
    const avatar = cleanAvatar(rawAvatar);

    let spectator = room.spectators.find((s) => s.socketId === socketId);
    if (!spectator) {
      spectator = {
        id: newId(),
        token: newToken(),
        name: this._uniqueSpectatorName(room, name),
        avatar,
        socketId,
        connected: true,
        isSpectator: true,
        voice: { active: false, muted: false },
      };
      room.spectators.push(spectator);
    } else {
      spectator.name = name;
      spectator.avatar = avatar;
      spectator.connected = true;
    }
    this._changed(room);
    return { room, spectator };
  }

  setVoiceActive(room, player, active, muted = false) {
    if (!player.voice) player.voice = { active: false, muted: false };
    player.voice.active = !!active;
    player.voice.muted = !!muted;
    this._changed(room);
  }

  setVoiceMuted(room, player, muted) {
    if (!player.voice) player.voice = { active: false, muted: false };
    player.voice.muted = !!muted;
    this._changed(room);
  }

  setAvatar(room, player, rawAvatar) {
    player.avatar = cleanAvatar(rawAvatar);
    this._changed(room);
  }

  setMaxPlayers(room, player, rawMaxPlayers) {
    this._requireHost(room, player);
    if (room.phase !== 'lobby') throw new GadhaError('BAD_PHASE', 'Player limit can only be changed in the lobby');
    const configuredMax = this.config.maxPlayers || 8;
    const maxPlayers = cleanMaxPlayers(rawMaxPlayers, MIN_PLAYERS, configuredMax);
    if (!maxPlayers) throw new GadhaError('BAD_MAX_PLAYERS', 'Invalid player limit');
    if (maxPlayers < room.players.length) {
      throw new GadhaError('BAD_MAX_PLAYERS', `Player limit cannot be lower than current player count (${room.players.length})`);
    }
    room.maxPlayers = maxPlayers;
    this._changed(room);
  }

  /** Re-attach a returning player using their secret session token. */
  rejoin(rawCode, rawToken, socketId) {
    const room = this._mustGetRoom(cleanRoomCode(rawCode));
    const token = cleanToken(rawToken);
    const player = room.players.find((p) => safeEqual(p.token, token));
    if (player) {
      if (player.left) throw new GadhaError('SESSION_EXPIRED', 'Your seat is no longer available');
      const previousSocketId = player.socketId;
      player.socketId = socketId;
      player.connected = true;
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
      this._scheduleAutoplay(room);
      this._changed(room);
      return { room, player, previousSocketId, isSpectator: false };
    }

    const spectator = room.spectators.find((s) => safeEqual(s.token, token));
    if (spectator) {
      const previousSocketId = spectator.socketId;
      spectator.socketId = socketId;
      spectator.connected = true;
      this._changed(room);
      return { room, player: spectator, previousSocketId, isSpectator: true };
    }

    throw new GadhaError('SESSION_EXPIRED', 'Your seat is no longer available');
  }

  /** The socket behind this player dropped (network loss, closed tab...). */
  disconnect(room, player) {
    if (player.voice) player.voice.active = false;
    if (player.isSpectator || room.spectators.includes(player)) {
      room.spectators = room.spectators.filter((s) => s !== player);
      this._changed(room);
      return;
    }
    if (!room.players.includes(player)) return;
    player.connected = false;
    player.socketId = null;
    if (room.phase === 'lobby') {
      clearTimeout(player.graceTimer);
      player.graceTimer = setTimeout(() => this._removeFromLobby(room, player), this.config.lobbyGraceMs);
      player.graceTimer.unref?.();
    }
    this._cleanGuideState(room, player);
    this._afterPlayerAbsent(room, player);
    this._changed(room);
  }

  /** Deliberate "Leave Room". */
  leave(room, player) {
    if (player.voice) player.voice.active = false;
    if (player.isSpectator || room.spectators.includes(player)) {
      room.spectators = room.spectators.filter((s) => s !== player);
      this._changed(room);
      return;
    }
    if (room.phase === 'lobby') {
      this._removeFromLobby(room, player);
      return;
    }
    player.left = true;
    player.connected = false;
    player.socketId = null;
    this._cleanGuideState(room, player);
    this._afterPlayerAbsent(room, player);
    this._changed(room);
  }

  _cleanGuideState(room, player) {
    if (!room || !player) return;
    if (room.guideMap) {
      delete room.guideMap[player.id];
      for (const [k, v] of Object.entries(room.guideMap)) {
        if (v === player.id) delete room.guideMap[k];
      }
    }
    if (room.guideRequests) {
      delete room.guideRequests[player.id];
      for (const [k, v] of Object.entries(room.guideRequests)) {
        if (v.fromId === player.id) delete room.guideRequests[k];
      }
    }
  }

  // ---------- game flow ----------

  start(room, player) {
    this._requireHost(room, player);
    if (room.phase !== 'lobby') throw new GadhaError('BAD_PHASE', 'The game has already started');

    for (const p of room.players.filter((x) => !x.connected)) this._dropPlayer(room, p);
    if (room.players.length < MIN_PLAYERS) {
      throw new GadhaError('NOT_ENOUGH_PLAYERS', `At least ${MIN_PLAYERS} players are needed`);
    }
    room.game = new GadhaGame(room.players.length);
    room.phase = 'playing';
    room.guideMap = {};
    room.guideRequests = {};
    room.turnStartedAt = Date.now();
    this._scheduleAutoplay(room);
    this._changed(room);
  }

  play(room, player, cardId) {
    if (room.phase !== 'playing' || !room.game) throw new GadhaError('BAD_PHASE', 'No game is being played');
    this._applyPlay(room, room.players.indexOf(player), cardId);
  }

  /** Host: abandon/finish the current game and return everyone to the lobby. */
  newGame(room, player) {
    this._requireHost(room, player);
    if (room.phase === 'lobby') throw new GadhaError('BAD_PHASE', 'Already in the lobby');
    this._clearTimers(room);
    room.game = null;
    room.phase = 'lobby';
    room.guideMap = {};
    room.guideRequests = {};
    for (const p of [...room.players]) {
      if (p.left || !p.connected) this._dropPlayer(room, p);
    }
    if (room.players.length > 0) this._changed(room);
  }

  requestGuide(room, safePlayer, targetPlayerId) {
    if (room.phase !== 'playing' || !room.game) {
      throw new GadhaError('BAD_PHASE', 'Guiding is only available during active play');
    }
    const safeSeat = room.players.indexOf(safePlayer);
    if (safeSeat < 0) {
      throw new GadhaError('NOT_PLAYER', 'Player not found in room');
    }
    // Requester must be safe (0 cards held)
    if (room.game.hands[safeSeat].length > 0) {
      throw new GadhaError('NOT_SAFE_PLAYER', 'Only players who have safely finished their cards can request to guide');
    }
    const target = room.players.find((p) => p.id === targetPlayerId && p.connected && !p.left);
    if (!target) {
      throw new GadhaError('TARGET_NOT_FOUND', 'Target player not found or offline');
    }
    const targetSeat = room.players.indexOf(target);
    if (targetSeat === safeSeat) {
      throw new GadhaError('CANNOT_GUIDE_SELF', 'Cannot guide yourself');
    }
    // Target player must still be actively playing (holds 1+ cards)
    if (room.game.hands[targetSeat].length === 0) {
      throw new GadhaError('TARGET_NOT_PLAYING', 'That player has already finished their cards');
    }

    if (!room.guideRequests) room.guideRequests = {};
    room.guideRequests[target.id] = {
      fromId: safePlayer.id,
      fromName: safePlayer.name,
      fromAvatar: safePlayer.avatar || '🫏',
      targetId: target.id,
      targetName: target.name,
      timestamp: Date.now(),
    };
    this._changed(room);
    return { ok: true };
  }

  respondGuide(room, targetPlayer, fromId, accept) {
    if (room.phase !== 'playing' || !room.game) {
      throw new GadhaError('BAD_PHASE', 'Game is not in playing phase');
    }
    if (!room.guideRequests || !room.guideRequests[targetPlayer.id]) {
      throw new GadhaError('NO_GUIDE_REQUEST', 'No pending guide request found');
    }
    const req = room.guideRequests[targetPlayer.id];
    if (req.fromId !== fromId) {
      throw new GadhaError('NO_GUIDE_REQUEST', 'Request does not match sender');
    }
    delete room.guideRequests[targetPlayer.id];

    if (accept) {
      const fromSeat = room.players.findIndex((p) => p.id === fromId && p.connected && !p.left);
      const targetSeat = room.players.indexOf(targetPlayer);
      if (
        fromSeat >= 0 &&
        targetSeat >= 0 &&
        room.game.hands[fromSeat].length === 0 &&
        room.game.hands[targetSeat].length > 0
      ) {
        if (!room.guideMap) room.guideMap = {};
        room.guideMap[fromId] = targetPlayer.id;
      }
    }
    this._changed(room);
    return { ok: true, accepted: !!accept };
  }

  cancelGuideRequest(room, safePlayer) {
    if (room.guideRequests) {
      for (const [k, v] of Object.entries(room.guideRequests)) {
        if (v.fromId === safePlayer.id) {
          delete room.guideRequests[k];
        }
      }
      this._changed(room);
    }
    return { ok: true };
  }

  stopGuiding(room, player) {
    this._cleanGuideState(room, player);
    this._changed(room);
    return { ok: true };
  }

  // ---------- internals ----------

  _applyPlay(room, seat, cardId) {
    const game = room.game;
    const outcome = game.playCard(seat, cardId, { autoResolve: false });
    clearTimeout(room.timers.autoplay);
    if (outcome.trickComplete) {
      // Leave the finished round visible for a moment so everyone can see who won it.
      clearTimeout(room.timers.resolve);
      if (this.config.trickPauseMs <= 0) {
        this._resolveNow(room);
        return;
      }
      room.timers.resolve = setTimeout(() => this._resolveNow(room), this.config.trickPauseMs);
      room.timers.resolve.unref?.();
    } else {
      room.turnStartedAt = Date.now();
      this._scheduleAutoplay(room);
    }
    this._changed(room);
  }

  _resolveNow(room) {
    clearTimeout(room.timers.resolve);
    room.timers.resolve = null;
    if (!this.rooms.has(room.code) || !room.game || room.game.phase !== 'resolving') return;
    room.game.resolveTrick();
    if (room.game.phase === 'finished') {
      room.phase = 'finished';
      room.guideMap = {};
      room.guideRequests = {};
      this._recordGameResult(room);
    } else {
      room.turnStartedAt = Date.now();
      if (room.guideMap) {
        for (const [safeId, targetId] of Object.entries(room.guideMap)) {
          const tSeat = room.players.findIndex((p) => p.id === targetId);
          if (tSeat < 0 || (room.game.hands[tSeat] && room.game.hands[tSeat].length === 0)) {
            delete room.guideMap[safeId];
          }
        }
      }
    }
    this._scheduleAutoplay(room);
    this._changed(room);
  }

  _recordGameResult(room) {
    if (!room.game || !room.game.result || room.game._recorded) return;
    room.game._recorded = true;
    room.gamesPlayed = (room.gamesPlayed || 0) + 1;
    if (!room.stats) room.stats = {};

    const gadhaSeat = room.game.result.gadhaSeat;
    for (let seat = 0; seat < room.players.length; seat++) {
      const p = room.players[seat];
      if (!p) continue;
      if (!room.stats[p.id]) {
        room.stats[p.id] = { gadhaCount: 0, winCount: 0, gamesPlayed: 0 };
      }
      room.stats[p.id].gamesPlayed += 1;
      if (seat === gadhaSeat) {
        room.stats[p.id].gadhaCount += 1;
      } else {
        room.stats[p.id].winCount += 1;
      }
    }
  }

  /** If the player whose turn it is is absent, play a random legal card for them after a delay. */
  _scheduleAutoplay(room) {
    clearTimeout(room.timers.autoplay);
    room.timers.autoplay = null;
    const game = room.game;
    if (room.phase !== 'playing' || !game || game.phase !== 'playing') return;
    const seat = game.turnSeat;
    const player = room.players[seat];
    if (!player || player.connected) return;

    const delay = player.left
      ? (this.config.trickPauseMs === 0 ? 10 : LEFT_AUTOPLAY_MS)
      : this.config.autoplayDelayMs;
    room.timers.autoplay = setTimeout(() => {
      room.timers.autoplay = null;
      if (!this.rooms.has(room.code) || room.phase !== 'playing' || room.game !== game) return;
      if (game.phase !== 'playing' || game.turnSeat !== seat || room.players[seat].connected) return;
      const legal = game.legalCards(seat);
      if (legal.length === 0) return;
      this._applyPlay(room, seat, legal[crypto.randomInt(legal.length)].id);
    }, delay);
    room.timers.autoplay.unref?.();
  }

  _afterPlayerAbsent(room, player) {
    if (room.hostId === player.id) this._transferHost(room);
    if (room.phase === 'playing') this._scheduleAutoplay(room);
  }

  _transferHost(room) {
    const next = room.players.find((p) => p.connected && !p.left && p.id !== room.hostId);
    if (next) room.hostId = next.id;
  }

  _removeFromLobby(room, player) {
    if (!this.rooms.has(room.code) || !room.players.includes(player)) return;
    if (room.phase !== 'lobby') return;
    this._dropPlayer(room, player);
    if (room.players.length > 0) this._changed(room);
  }

  /** Remove a player entirely (only safe when no game is in progress). */
  _dropPlayer(room, player) {
    clearTimeout(player.graceTimer);
    this._cleanGuideState(room, player);
    room.players = room.players.filter((p) => p !== player);
    if (room.players.length === 0) {
      this._clearTimers(room);
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === player.id) {
      const next = room.players.find((p) => p.connected) || room.players[0];
      room.hostId = next.id;
    }
  }

  _sweepIdleRooms() {
    const cutoff = Date.now() - this.config.roomIdleMs;
    for (const room of [...this.rooms.values()]) {
      const anyoneHere = room.players.some((p) => p.connected);
      if (!anyoneHere && room.lastActivity < cutoff) {
        this._clearTimers(room);
        for (const p of room.players) clearTimeout(p.graceTimer);
        this.rooms.delete(room.code);
      }
    }
  }

  _clearTimers(room) {
    for (const key of Object.keys(room.timers)) clearTimeout(room.timers[key]);
    room.timers = {};
  }

  _changed(room) {
    room.lastActivity = Date.now();
    this.notify(room);
  }

  _newPlayer(name, socketId, avatar = '🫏') {
    return {
      id: newId(),
      token: newToken(),
      name,
      avatar,
      socketId,
      connected: true,
      left: false,
      graceTimer: null,
      voice: { active: false, muted: false },
    };
  }

  _uniqueName(room, name) {
    const taken = new Set(room.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 100; i++) {
      const candidate = `${name} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name} ${newId().slice(0, 3)}`;
  }

  _uniqueSpectatorName(room, name) {
    const taken = new Set([...room.players, ...room.spectators].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 100; i++) {
      const candidate = `${name} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name} ${newId().slice(0, 3)}`;
  }

  _mustGetRoom(code) {
    const room = this.rooms.get(code);
    if (!room) throw new GadhaError('ROOM_NOT_FOUND', 'No room with that code');
    return room;
  }

  _requireHost(room, player) {
    if (room.hostId !== player.id) throw new GadhaError('NOT_HOST', 'Only the host can do that');
  }
}

module.exports = { RoomManager };
