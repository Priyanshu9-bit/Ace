'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, TestClient } = require('./helpers');

async function setupTable(url, names) {
  const clients = names.map((n) => new TestClient(url, n));
  const created = await clients[0].create(names[0]);
  assert.equal(created.ok, true);
  for (let i = 1; i < clients.length; i++) {
    const res = await clients[i].join(created.code, names[i]);
    assert.equal(res.ok, true, `${names[i]} should be able to join`);
  }
  return { clients, code: created.code };
}

const myTurn = (c) => c.view.game && c.view.game.turnSeat === c.view.you.seat && c.view.game.legal.length > 0;

let botPickCounter = 0;
/** Drive a whole game with bots that pick legal cards without deterministic cycling. */
async function playToEnd(clients, { pick = (legal) => legal[(botPickCounter++) % legal.length] } = {}) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (clients[0].view.phase === 'finished') return;
    const mover = clients.find(myTurn);
    if (mover) {
      const res = await mover.emit('game:play', { cardId: pick(mover.view.game.legal) });
      assert.equal(res.ok, true, `legal move rejected: ${JSON.stringify(res)}`);
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  throw new Error('game did not finish in time');
}

test('create / join / lobby: players see each other, host is flagged, codes are short', async () => {
  const { server, url } = await startTestServer();
  try {
    const { clients, code } = await setupTable(url, ['Asha', 'Bibhu', 'Chinmayee']);
    assert.match(code, /^[A-Z2-9]{5}$/);
    await clients[2].waitFor((v) => v.players.length === 3);
    for (const c of clients) {
      assert.equal(c.view.phase, 'lobby');
      assert.deepEqual(c.view.players.map((p) => p.name), ['Asha', 'Bibhu', 'Chinmayee']);
      assert.equal(c.view.hostId, clients[0].session.playerId);
    }
    assert.equal(clients[0].view.you.isHost, true);
    assert.equal(clients[1].view.you.isHost, false);
    clients.forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('join errors: unknown room, bad code, bad name, duplicate names, full room', async () => {
  const { server, url } = await startTestServer({ maxPlayers: 3 });
  try {
    const { clients, code } = await setupTable(url, ['Ram', 'Sita']);
    const c = new TestClient(url, 'x');
    await c.ready;
    assert.equal((await c.emit('room:join', { code: 'ZZZZZ', name: 'X' })).error.code, 'ROOM_NOT_FOUND');
    assert.equal((await c.emit('room:join', { code: '!!', name: 'X' })).error.code, 'BAD_ROOM_CODE');
    assert.equal((await c.emit('room:join', { code, name: '   ' })).error.code, 'BAD_NAME');
    assert.equal((await c.emit('room:join', { code, name: 'a'.repeat(40) })).error.code, 'BAD_NAME');
    assert.equal((await c.emit('room:join', null)).error.code, 'BAD_ROOM_CODE');

    const dup = await c.join(code.toLowerCase(), 'ram'); // codes are case-insensitive; names get de-duplicated
    assert.equal(dup.ok, true);
    await clients[0].waitFor((v) => v.players.length === 3);
    assert.deepEqual(clients[0].view.players.map((p) => p.name), ['Ram', 'Sita', 'ram 2']);

    const full = new TestClient(url, 'late');
    await full.ready;
    assert.equal((await full.emit('room:join', { code, name: 'Late' })).error.code, 'ROOM_FULL');
    [...clients, c, full].forEach((x) => x.close());
  } finally {
    await server.close();
  }
});

test('only the host can start; need 2+ players', async () => {
  const { server, url } = await startTestServer();
  try {
    const solo = new TestClient(url, 'solo');
    await solo.create('Solo');
    assert.equal((await solo.emit('game:start', {})).error.code, 'NOT_ENOUGH_PLAYERS');

    const { clients } = await setupTable(url, ['Host', 'Guest']);
    assert.equal((await clients[1].emit('game:start', {})).error.code, 'NOT_HOST');
    assert.equal((await clients[0].emit('game:start', {})).ok, true);
    await clients[1].waitFor((v) => v.phase === 'playing');
    assert.equal((await clients[0].emit('game:start', {})).error.code, 'BAD_PHASE');

    // nobody can join once the game began
    const late = new TestClient(url, 'late');
    assert.equal((await late.join(clients[0].session.code, 'Late')).error.code, 'GAME_IN_PROGRESS');
    [solo, ...clients, late].forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('host can select player limit at creation and adjust it dynamically in lobby', async () => {
  const { server, url } = await startTestServer();
  try {
    const host = new TestClient(url, 'host');
    // Host creates room with player limit 2
    const res = await host.create('Host', 2);
    assert.equal(res.ok, true);
    await host.waitFor((v) => v.maxPlayers === 2);
    assert.equal(host.view.maxPlayers, 2);

    const guest1 = new TestClient(url, 'guest1');
    assert.equal((await guest1.join(host.session.code, 'Guest1')).ok, true);
    await host.waitFor((v) => v.players.length === 2);

    // 3rd player cannot join because limit is 2
    const guest2 = new TestClient(url, 'guest2');
    assert.equal((await guest2.join(host.session.code, 'Guest2')).error.code, 'ROOM_FULL');

    // Guest cannot change player limit
    assert.equal((await guest1.emit('room:setMaxPlayers', { maxPlayers: 4 })).error.code, 'NOT_HOST');

    // Host cannot set player limit below current players (2)
    assert.equal((await host.emit('room:setMaxPlayers', { maxPlayers: 1 })).error.code, 'BAD_MAX_PLAYERS');
    // Host cannot set player limit beyond server max (8)
    assert.equal((await host.emit('room:setMaxPlayers', { maxPlayers: 9 })).error.code, 'BAD_MAX_PLAYERS');

    // Host expands player limit to 3
    const setRes = await host.emit('room:setMaxPlayers', { maxPlayers: 3 });
    assert.equal(setRes.ok, true);
    assert.equal(setRes.maxPlayers, 3);
    await host.waitFor((v) => v.maxPlayers === 3);
    await guest1.waitFor((v) => v.maxPlayers === 3);

    // Now guest2 can join!
    assert.equal((await guest2.join(host.session.code, 'Guest2')).ok, true);
    await host.waitFor((v) => v.players.length === 3);

    // 4th player cannot join because limit is 3
    const guest3 = new TestClient(url, 'guest3');
    assert.equal((await guest3.join(host.session.code, 'Guest3')).error.code, 'ROOM_FULL');

    [host, guest1, guest2, guest3].forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('avatars, turn timer, and spectator mode work in multiplayer', async () => {
  const { server, url } = await startTestServer({ autoplayDelayMs: 15000 });
  try {
    const host = new TestClient(url, 'host');
    await host.create('Host', 2, '👑');
    await host.waitFor((v) => v.players[0].avatar === '👑');
    assert.equal(host.view.players[0].avatar, '👑');

    const guest = new TestClient(url, 'guest');
    await guest.join(host.session.code, 'Guest', '🐯');
    await host.waitFor((v) => v.players.length === 2 && v.players[1].avatar === '🐯');

    // Guest updates avatar dynamically
    const avRes = await guest.emit('room:setAvatar', { avatar: '⚡' });
    assert.equal(avRes.ok, true);
    await host.waitFor((v) => v.players[1].avatar === '⚡');

    // Spectator joins
    const spec = new TestClient(url, 'spec');
    const specRes = await spec.spectate(host.session.code, 'Viewer', '🦉');
    assert.equal(specRes.ok, true);
    assert.equal(specRes.isSpectator, true);

    await spec.waitFor((v) => v.you.isSpectator === true);
    assert.equal(spec.view.you.isSpectator, true);
    assert.equal(spec.view.you.seat, -1);
    assert.equal(spec.view.spectatorCount, 1);
    assert.equal(spec.view.spectators[0].name, 'Viewer');

    // Host starts game
    await host.emit('game:start', {});
    await Promise.all([
      host.waitFor((v) => v.phase === 'playing'),
      guest.waitFor((v) => v.phase === 'playing'),
      spec.waitFor((v) => v.phase === 'playing'),
    ]);

    // Spectator sees turn timing
    assert.ok(spec.view.turnStartedAt > 0);
    assert.equal(spec.view.turnTimeoutMs, 15000);
    assert.deepEqual(spec.view.game.hand, []); // Spectator holds no cards

    // Spectator cannot play cards
    const playAttempt = await spec.emit('game:play', { cardId: 'AS' });
    assert.equal(playAttempt.error.code, 'NOT_YOUR_TURN');

    // Spectator leaves
    await spec.emit('room:leave', {});
    await host.waitFor((v) => v.spectatorCount === 0);

    [host, guest, spec].forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('PRIVACY: a player never receives another player\'s cards, in any message, for a whole game', async () => {
  const { server, url } = await startTestServer({ trickPauseMs: 0 });
  try {
    const { clients } = await setupTable(url, ['A', 'B', 'C', 'D']);
    await clients[0].emit('game:start', {});
    await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'playing')));

    // Collect every card each player was ever legitimately shown as their own hand,
    // then make sure no one ever saw a card that was in somebody else's hand at deal time.
    const startingHands = clients.map((c) => new Set(c.view.game.hand.map((x) => x.id)));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (i !== j) for (const id of startingHands[i]) assert.ok(!startingHands[j].has(id), 'hands overlap!');
      }
    }
    assert.equal(startingHands.reduce((n, s) => n + s.size, 0), 52);

    await playToEnd(clients);
    await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'finished')));

    clients.forEach((client, me) => {
      for (const state of client.states) {
        // 1. legal moves are subsets of the own hand
        const handIds = new Set((state.game ? state.game.hand : []).map((c) => c.id));
        for (const id of state.game ? state.game.legal : []) assert.ok(handIds.has(id));
        // 2. other players expose only counts and avatar, never their hands
        for (const p of state.players) {
          assert.deepEqual(Object.keys(p).sort(), ['avatar', 'cardCount', 'connected', 'id', 'isHost', 'left', 'name', 'pileCount', 'seat', 'voice'].sort());
          assert.equal(p.hand, undefined);
        }
        // 3. no tokens of other players leaked
        for (const other of clients) {
          if (other !== client) assert.ok(!JSON.stringify(state).includes(other.session.token), 'token leaked');
        }
      }
    });
    clients.forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('server rejects invalid moves: out of turn, unowned card, wrong suit, malformed, not in a room', async () => {
  const { server, url } = await startTestServer({ trickPauseMs: 0 });
  try {
    const { clients } = await setupTable(url, ['A', 'B', 'C']);
    await clients[0].emit('game:start', {});
    await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'playing')));

    const starter = clients.find(myTurn);
    const others = clients.filter((c) => c !== starter);

    // out of turn
    const out = await others[0].emit('game:play', { cardId: others[0].view.game.hand[0].id });
    assert.equal(out.error.code, 'NOT_YOUR_TURN');
    // not the Ace of Spades
    const notAce = starter.view.game.hand.find((c) => c.id !== 'AS');
    assert.equal((await starter.emit('game:play', { cardId: notAce.id })).error.code, 'MUST_PLAY_ACE_OF_SPADES');
    // somebody else's card
    assert.equal((await starter.emit('game:play', { cardId: others[0].view.game.hand[0].id })).error.code, 'CARD_NOT_IN_HAND');
    // malformed input
    for (const cardId of [undefined, null, 5, {}, 'ZZ', '1S', 'AS; DROP', ['AS']]) {
      assert.equal((await starter.emit('game:play', { cardId })).error.code, 'BAD_CARD', JSON.stringify(cardId));
    }
    // a claimed winner or extra fields are simply ignored
    assert.equal((await starter.emit('game:play', { cardId: 'AS', winner: 2, seat: 1 })).ok, true);
    // the same card twice
    assert.notEqual((await starter.emit('game:play', { cardId: 'AS' })).ok, true);

    // follow-suit enforcement: the next player holding spades must not play another suit
    const next = clients.find(myTurn);
    const hand = next.view.game.hand;
    const offSuit = hand.find((c) => c.suit !== 'S');
    if (hand.some((c) => c.suit === 'S') && offSuit) {
      assert.equal((await next.emit('game:play', { cardId: offSuit.id })).error.code, 'MUST_FOLLOW_SUIT');
    }

    // a stranger with no room membership cannot do anything
    const stranger = new TestClient(url, 'stranger');
    await stranger.ready;
    assert.equal((await stranger.emit('game:play', { cardId: 'AS' })).error.code, 'NOT_IN_ROOM');
    assert.equal((await stranger.emit('game:start', {})).error.code, 'NOT_IN_ROOM');
    assert.equal((await stranger.emit('room:sync', {})).error.code, 'NOT_IN_ROOM');
    // ...and cannot hijack a seat with a guessed token
    assert.equal((await stranger.emit('room:rejoin', { code: clients[0].session.code, token: 'x'.repeat(48) })).error.code, 'SESSION_EXPIRED');
    assert.equal((await stranger.emit('room:rejoin', { code: clients[0].session.code, token: 'short' })).error.code, 'BAD_TOKEN');
    [...clients, stranger].forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('full simulated games with 2, 4, 5, 7 and 8 players finish and name a Gadha', async () => {
  const { server, url } = await startTestServer({ trickPauseMs: 0 });
  try {
    for (const n of [2, 4, 5, 7, 8]) {
      const names = Array.from({ length: n }, (_, i) => `P${i + 1}`);
      const { clients } = await setupTable(url, names);
      await clients[0].emit('game:start', {});
      await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'playing')));
      await playToEnd(clients);
      await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'finished')));

      const results = clients.map((c) => c.view.game.result);
      assert.ok(results[0].gadhaName, 'result names the Gadha');
      assert.ok(names.includes(results[0].gadhaName));
      results.forEach((r) => assert.deepEqual(r, results[0]));
      assert.ok(clients[0].view.game.lastTrick.seq >= 1);

      // New Game: host returns everyone to the lobby and can start again
      assert.equal((await clients[1 % n].emit('game:new', {})).error.code, n > 1 ? 'NOT_HOST' : undefined);
      assert.equal((await clients[0].emit('game:new', {})).ok, true);
      await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'lobby')));
      assert.equal(clients[0].view.players.length, n);
      assert.equal(clients[0].view.game, null);
      clients.forEach((c) => c.close());
    }
  } finally {
    await server.close();
  }
});

test('rooms are isolated: two games at once do not interfere', async () => {
  const { server, url } = await startTestServer({ trickPauseMs: 0 });
  try {
    const t1 = await setupTable(url, ['A1', 'B1', 'C1']);
    const t2 = await setupTable(url, ['A2', 'B2', 'C2', 'D2']);
    assert.notEqual(t1.code, t2.code);
    await Promise.all([t1.clients[0].emit('game:start', {}), t2.clients[0].emit('game:start', {})]);
    await Promise.all([...t1.clients, ...t2.clients].map((c) => c.waitFor((v) => v.phase === 'playing')));
    await Promise.all([playToEnd(t1.clients), playToEnd(t2.clients)]);
    t1.clients.forEach((c) => assert.ok(c.view.players.every((p) => p.name.endsWith('1'))));
    t2.clients.forEach((c) => assert.ok(c.view.players.every((p) => p.name.endsWith('2'))));
    assert.equal(t1.clients[0].view.players.length, 3);
    assert.equal(t2.clients[0].view.players.length, 4);
    [...t1.clients, ...t2.clients].forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('reconnection: a dropped player returns with their token and gets their own hand back', async () => {
  const { server, url } = await startTestServer({ autoplayDelayMs: 60000 });
  try {
    const { clients, code } = await setupTable(url, ['A', 'B', 'C']);
    await clients[0].emit('game:start', {});
    await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'playing')));

    const victim = clients[1];
    const handBefore = victim.view.game.hand.map((c) => c.id);
    const session = victim.session;
    victim.close();
    await clients[0].waitFor((v) => v.players[1].connected === false);

    const comeback = new TestClient(url, 'B-again');
    await comeback.ready;
    const res = await comeback.emit('room:rejoin', { code, token: session.token });
    assert.equal(res.ok, true);
    assert.equal(res.playerId, session.playerId);
    await comeback.waitFor((v) => v.phase === 'playing');
    assert.deepEqual(comeback.view.game.hand.map((c) => c.id), handBefore);
    assert.equal(comeback.view.you.seat, 1);
    await clients[0].waitFor((v) => v.players[1].connected === true);

    // a second tab with the same token takes over; the old one is told
    const tab2 = new TestClient(url, 'B-tab2');
    await tab2.ready;
    assert.equal((await tab2.emit('room:rejoin', { code, token: session.token })).ok, true);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(comeback.replaced, true);
    assert.equal((await comeback.emit('game:play', { cardId: 'AS' })).error.code, 'NOT_IN_ROOM');
    [clients[0], clients[2], comeback, tab2].forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('an absent player is auto-played so the table never stalls', async () => {
  const { server, url } = await startTestServer({ trickPauseMs: 0, autoplayDelayMs: 80 });
  try {
    const { clients } = await setupTable(url, ['A', 'B', 'C']);
    await clients[0].emit('game:start', {});
    await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'playing')));

    // Make the Ace-of-Spades holder disconnect: the server must play A♠ for them.
    const starter = clients.find(myTurn);
    const watcher = clients.find((c) => c !== starter);
    starter.close();
    await watcher.waitFor((v) => v.game.trick.length >= 1 && v.game.trick[0].card.id === 'AS');
    assert.equal(watcher.view.game.trick[0].seat, starter.view.you.seat);
    clients.forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('leaving: lobby leaver frees the seat and host moves; leaving mid-game is auto-played to the end', async () => {
  const { server, url } = await startTestServer({ trickPauseMs: 0 });
  try {
    // lobby
    const lobby = await setupTable(url, ['H', 'G1', 'G2']);
    assert.equal((await lobby.clients[0].emit('room:leave', {})).ok, true);
    await lobby.clients[1].waitFor((v) => v.players.length === 2);
    assert.equal(lobby.clients[1].view.hostId, lobby.clients[1].session.playerId, 'host transferred');
    assert.equal((await lobby.clients[0].emit('game:start', {})).error.code, 'NOT_IN_ROOM');
    lobby.clients.forEach((c) => c.close());

    // mid-game
    const { clients } = await setupTable(url, ['A', 'B', 'C']);
    await clients[0].emit('game:start', {});
    await Promise.all(clients.map((c) => c.waitFor((v) => v.phase === 'playing')));
    assert.equal((await clients[2].emit('room:leave', {})).ok, true);
    // the two remaining humans play; the leaver's cards are auto-played
    const rest = clients.slice(0, 2);
    const deadline = Date.now() + 20000;
    while (rest[0].view.phase !== 'finished' && Date.now() < deadline) {
      const mover = rest.find(myTurn);
      if (mover) await mover.emit('game:play', { cardId: mover.view.game.legal[0] });
      else await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(rest[0].view.phase, 'finished');
    assert.ok(rest[0].view.players[2].left);
    clients.forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('lobby players who drop are removed after the grace period; empty rooms are deleted', async () => {
  const { server, url } = await startTestServer({ lobbyGraceMs: 80 });
  try {
    const { clients, code } = await setupTable(url, ['H', 'G']);
    clients[1].close();
    await clients[0].waitFor((v) => v.players.length === 1);
    assert.equal(server.manager.getRoom(code).players.length, 1);
    clients[0].close();
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(server.manager.getRoom(code), null, 'empty room removed');
  } finally {
    await server.close();
  }
});

test('voice chat: signaling, join, mute, signal forwarding strictly in room, and peer leave', async () => {
  const { server, url } = await startTestServer();
  try {
    const { clients } = await setupTable(url, ['Alice', 'Bob']);
    const [alice, bob] = clients;

    // Both see iceServers configured
    assert.ok(Array.isArray(alice.view.iceServers));
    assert.ok(alice.view.iceServers.length > 0);

    // Initial voice status is inactive
    assert.equal(alice.view.you.voice.active, false);
    assert.equal(bob.view.players.find((p) => p.name === 'Alice').voice.active, false);

    // Track voice events on Bob's socket
    const bobEvents = [];
    bob.socket.on('voice:peer-joined', (e) => bobEvents.push({ type: 'joined', ...e }));
    bob.socket.on('voice:peer-mute', (e) => bobEvents.push({ type: 'mute', ...e }));
    bob.socket.on('voice:peer-left', (e) => bobEvents.push({ type: 'left', ...e }));
    bob.socket.on('voice:signal', (e) => bobEvents.push({ type: 'signal', ...e }));

    // Alice joins voice
    const joinRes = await alice.emit('voice:join', { muted: false });
    assert.ok(joinRes.ok);
    assert.deepEqual(joinRes.peers, []); // Bob has not joined voice yet

    // Bob receives voice:peer-joined and state update shows Alice active
    await bob.waitFor((v) => v.players.find((p) => p.id === alice.session.playerId)?.voice.active === true);
    assert.ok(bobEvents.some((e) => e.type === 'joined' && e.peerId === alice.session.playerId));

    // Bob joins voice with muted = true
    const bobJoinRes = await bob.emit('voice:join', { muted: true });
    assert.ok(bobJoinRes.ok);
    assert.equal(bobJoinRes.peers.length, 1);
    assert.equal(bobJoinRes.peers[0].id, alice.session.playerId);

    // Alice sends WebRTC signal to Bob
    const sigRes = await alice.emit('voice:signal', {
      to: bob.session.playerId,
      signal: { type: 'offer', sdp: 'fake-sdp-offer' },
    });
    assert.ok(sigRes.ok);

    // Bob receives signal strictly from Alice
    await new Promise((r) => setTimeout(r, 50));
    const receivedSig = bobEvents.find((e) => e.type === 'signal');
    assert.ok(receivedSig);
    assert.equal(receivedSig.from, alice.session.playerId);
    assert.equal(receivedSig.signal.type, 'offer');

    // Bob cannot signal an invalid or cross-room peer
    const badSig = await bob.emit('voice:signal', {
      to: 'non-existent-peer',
      signal: { type: 'answer', sdp: 'fake-sdp-answer' },
    });
    assert.equal(badSig.ok, false);
    assert.equal(badSig.error.code, 'PEER_NOT_FOUND');

    // Alice toggles mute
    const muteRes = await alice.emit('voice:mute', { muted: true });
    assert.ok(muteRes.ok);
    await bob.waitFor((v) => v.players.find((p) => p.id === alice.session.playerId)?.voice.muted === true);
    assert.ok(bobEvents.some((e) => e.type === 'mute' && e.peerId === alice.session.playerId && e.muted === true));

    // Alice leaves voice
    const leaveRes = await alice.emit('voice:leave');
    assert.ok(leaveRes.ok);
    await bob.waitFor((v) => v.players.find((p) => p.id === alice.session.playerId)?.voice.active === false);
    assert.ok(bobEvents.some((e) => e.type === 'left' && e.peerId === alice.session.playerId));

    clients.forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

