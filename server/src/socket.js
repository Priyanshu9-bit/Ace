'use strict';
/**
 * Socket.IO wiring. Every handler:
 *   1. is rate limited,
 *   2. validates its payload,
 *   3. identifies the player ONLY from the server-side binding of this socket
 *      (never from anything the client claims),
 *   4. replies through an ack callback: { ok: true, ... } or { ok: false, error: { code, message } }.
 * State is pushed separately as the `state` event, individually to each player's own socket.
 */
const { GadhaError } = require('./errors');
const { buildView } = require('./views');
const { cleanCardId, cleanCardIds } = require('./validate');

function createRateLimiter(maxEvents, windowMs) {
  let stamps = [];
  return () => {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < windowMs);
    if (stamps.length >= maxEvents) return false;
    stamps.push(now);
    return true;
  };
}

function registerSocketHandlers(io, manager, config) {
  /** Send each connected player and spectator their own private view of the room. */
  function broadcast(room) {
    for (const player of room.players) {
      if (player.connected && player.socketId) {
        io.to(player.socketId).emit('state', buildView(room, player.id, config.maxPlayers));
      }
    }
    if (room.spectators) {
      for (const spec of room.spectators) {
        if (spec.connected && spec.socketId) {
          io.to(spec.socketId).emit('state', buildView(room, spec.id, config.maxPlayers));
        }
      }
    }
  }
  manager.notify = broadcast;

  function emitToRoom(room, event, data, exceptSocketId = null) {
    const all = [...room.players, ...(room.spectators || [])];
    for (const p of all) {
      if (p.connected && p.socketId && p.socketId !== exceptSocketId) {
        io.to(p.socketId).emit(event, data);
      }
    }
  }

  function getActiveVoicePeers(room, excludeId) {
    const all = [...room.players, ...(room.spectators || [])];
    return all
      .filter((p) => p.connected && p.id !== excludeId && p.voice && p.voice.active)
      .map((p) => ({ id: p.id, name: p.name, muted: !!p.voice.muted }));
  }

  io.on('connection', (socket) => {
    socket.data.code = null;
    socket.data.playerId = null;
    const allow = createRateLimiter(config.rateLimitMax || 500, 10000);

    /** Resolve and verify the room membership of this socket. */
    function context() {
      const room = socket.data.code ? manager.getRoom(socket.data.code) : null;
      const player = room ? room.players.find((p) => p.id === socket.data.playerId) : null;
      if (room && player && player.socketId === socket.id && !player.left) {
        return { room, player, isSpectator: false };
      }
      const spectator = room && room.spectators ? room.spectators.find((s) => s.id === socket.data.playerId) : null;
      if (room && spectator && spectator.socketId === socket.id) {
        return { room, player: spectator, isSpectator: true };
      }
      throw new GadhaError('NOT_IN_ROOM', 'You are not in a room');
    }

    function bind(room, player) {
      socket.data.code = room.code;
      socket.data.playerId = player.id;
    }
    function unbind() {
      socket.data.code = null;
      socket.data.playerId = null;
    }

    function on(event, handler) {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          if (!allow()) throw new GadhaError('RATE_LIMITED', 'Slow down a little');
          const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
          reply({ ok: true, ...(handler(body) || {}) });
        } catch (err) {
          if (!(err instanceof GadhaError)) {
            console.error(`[socket] unexpected error in ${event}:`, err);
            reply({ ok: false, error: { code: 'INTERNAL', message: 'Something went wrong' } });
          } else {
            reply({ ok: false, error: { code: err.code, message: err.message } });
          }
        }
      });
    }

    on('room:create', ({ name, maxPlayers, avatar }) => {
      if (socket.data.code) throw new GadhaError('ALREADY_IN_ROOM', 'Leave your current room first');
      const { room, player } = manager.createRoom(name, socket.id, maxPlayers, avatar);
      bind(room, player);
      return { code: room.code, playerId: player.id, token: player.token };
    });

    on('room:setMaxPlayers', ({ maxPlayers }) => {
      const { room, player, isSpectator } = context();
      if (isSpectator) throw new GadhaError('NOT_HOST', 'Spectators cannot configure rooms');
      manager.setMaxPlayers(room, player, maxPlayers);
      return { maxPlayers: room.maxPlayers };
    });

    on('room:setAvatar', ({ avatar }) => {
      const { room, player } = context();
      manager.setAvatar(room, player, avatar);
      return { avatar: player.avatar };
    });

    on('room:join', ({ code, name, avatar }) => {
      if (socket.data.code) throw new GadhaError('ALREADY_IN_ROOM', 'Leave your current room first');
      const { room, player } = manager.joinRoom(code, name, socket.id, avatar);
      bind(room, player);
      return { code: room.code, playerId: player.id, token: player.token };
    });

    on('room:spectate', ({ code, name, avatar }) => {
      if (socket.data.code) throw new GadhaError('ALREADY_IN_ROOM', 'Leave your current room first');
      const { room, spectator } = manager.joinSpectator(code, name, socket.id, avatar);
      bind(room, spectator);
      return { code: room.code, playerId: spectator.id, token: spectator.token, isSpectator: true };
    });

    on('room:rejoin', ({ code, token }) => {
      if (socket.data.code) throw new GadhaError('ALREADY_IN_ROOM', 'Leave your current room first');
      const { room, player, previousSocketId, isSpectator } = manager.rejoin(code, token, socket.id);
      bind(room, player);
      // A second tab/device for the same seat replaces the old connection.
      const old = previousSocketId && previousSocketId !== socket.id ? io.sockets.sockets.get(previousSocketId) : null;
      if (old) {
        old.data.code = null;
        old.data.playerId = null;
        old.emit('session:replaced');
      }
      return { code: room.code, playerId: player.id, isSpectator };
    });

    on('room:leave', () => {
      const { room, player } = context();
      if (player.voice && player.voice.active) {
        player.voice.active = false;
        emitToRoom(room, 'voice:peer-left', { peerId: player.id }, socket.id);
      }
      unbind();
      manager.leave(room, player);
    });

    on('room:sync', () => {
      const { room, player } = context();
      socket.emit('state', buildView(room, player.id, config.maxPlayers));
    });

    on('game:start', () => {
      const { room, player, isSpectator } = context();
      if (isSpectator) throw new GadhaError('NOT_HOST', 'Spectators cannot start the game');
      manager.start(room, player);
    });

    on('game:play', (payload) => {
      const { room, player, isSpectator } = context();
      if (isSpectator) throw new GadhaError('NOT_YOUR_TURN', 'Spectators cannot play cards');
      if (!payload || typeof payload !== 'object') throw new GadhaError('BAD_CARD', 'Invalid card payload');
      let cardInput;
      if (Array.isArray(payload.cardIds)) {
        cardInput = cleanCardIds(payload.cardIds);
      } else {
        cardInput = cleanCardId(payload.cardId);
      }
      manager.play(room, player, cardInput);
    });

    on('game:new', () => {
      const { room, player, isSpectator } = context();
      if (isSpectator) throw new GadhaError('NOT_HOST', 'Spectators cannot restart the game');
      manager.newGame(room, player);
    });

    on('game:gadhaSound', () => {
      const { room, player } = context();
      emitToRoom(room, 'game:gadhaSound', {
        gadhaId: room.game?.result?.gadhaId,
        gadhaSeat: room.game?.result?.gadhaSeat,
        senderId: player.id,
        senderName: player.name,
      });
      return { ok: true };
    });

    on('voice:join', ({ muted }) => {
      const { room, player } = context();
      manager.setVoiceActive(room, player, true, !!muted);
      emitToRoom(
        room,
        'voice:peer-joined',
        { peerId: player.id, peerName: player.name, muted: !!player.voice.muted },
        socket.id
      );
      return { peers: getActiveVoicePeers(room, player.id) };
    });

    on('voice:mute', ({ muted }) => {
      const { room, player } = context();
      manager.setVoiceMuted(room, player, !!muted);
      emitToRoom(room, 'voice:peer-mute', { peerId: player.id, muted: !!muted }, socket.id);
      return { muted: !!muted };
    });

    on('voice:leave', () => {
      const { room, player } = context();
      if (player.voice?.active) {
        manager.setVoiceActive(room, player, false, false);
        emitToRoom(room, 'voice:peer-left', { peerId: player.id }, socket.id);
      }
      return { ok: true };
    });

    on('voice:signal', ({ to, signal }) => {
      const { room, player } = context();
      if (!to || typeof to !== 'string' || !signal) {
        throw new GadhaError('BAD_SIGNAL', 'Invalid signaling payload');
      }
      const all = [...room.players, ...(room.spectators || [])];
      const target = all.find((p) => p.id === to && p.connected && p.socketId);
      if (!target) {
        throw new GadhaError('PEER_NOT_FOUND', 'Target peer is not available in this room');
      }
      io.to(target.socketId).emit('voice:signal', {
        from: player.id,
        signal,
      });
      return { ok: true };
    });

    on('voice:setTarget', ({ targetId }) => {
      const { room, player } = context();
      if (!player.voice) player.voice = { active: false, muted: false };
      player.voice.targetId = targetId || 'all';
      emitToRoom(
        room,
        'voice:target-change',
        { peerId: player.id, targetId: player.voice.targetId },
        socket.id
      );
      return { targetId: player.voice.targetId };
    });

    on('guide:request', ({ targetId }) => {
      const { room, player, isSpectator } = context();
      if (isSpectator) throw new GadhaError('NOT_PLAYER', 'Spectators cannot guide');
      if (!targetId || typeof targetId !== 'string') throw new GadhaError('BAD_TARGET', 'Invalid target player');
      manager.requestGuide(room, player, targetId);
      return { ok: true };
    });

    on('guide:respond', ({ fromId, accept }) => {
      const { room, player, isSpectator } = context();
      if (isSpectator) throw new GadhaError('NOT_PLAYER', 'Spectators cannot respond to guide');
      if (!fromId || typeof fromId !== 'string') throw new GadhaError('BAD_REQUESTER', 'Invalid requester');
      const res = manager.respondGuide(room, player, fromId, !!accept);
      return { ok: true, accepted: res.accepted };
    });

    on('guide:cancel', () => {
      const { room, player } = context();
      manager.cancelGuideRequest(room, player);
      return { ok: true };
    });

    on('guide:stop', () => {
      const { room, player } = context();
      manager.stopGuiding(room, player);
      return { ok: true };
    });

    socket.on('disconnect', () => {
      const room = socket.data.code ? manager.getRoom(socket.data.code) : null;
      const player = room
        ? (room.players.find((p) => p.id === socket.data.playerId) || room.spectators?.find((s) => s.id === socket.data.playerId))
        : null;
      // Ignore sockets that were already replaced by a newer connection for the same seat.
      if (room && player && player.socketId === socket.id) {
        if (player.voice && player.voice.active) {
          player.voice.active = false;
          emitToRoom(room, 'voice:peer-left', { peerId: player.id }, socket.id);
        }
        manager.disconnect(room, player);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
