'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GadhaGame } = require('../src/engine/game');
const { getCard, RANK_VALUE } = require('../src/engine/cards');
const { chooseBotMove } = require('../src/engine/bot');
const { RoomManager } = require('../src/rooms');
const { loadConfig } = require('../src/config');
const { GadhaError } = require('../src/errors');

test('chooseBotMove: plays Ace of Spades when game starts', () => {
  const game = new GadhaGame(4);
  const starter = game.turnSeat;
  assert.equal(game.awaitingFirstCard, true);
  const move = chooseBotMove(game, starter);
  assert.equal(move, 'AS');
});

test('chooseBotMove: follows suit legally', () => {
  const hands = [
    [getCard('AS'), getCard('KS'), getCard('5H')],
    [getCard('QS'), getCard('2S'), getCard('AH')],
  ];
  const game = new GadhaGame(2, { hands });
  // Seat 0 plays AS
  game.playCard(0, 'AS');
  assert.equal(game.turnSeat, 1);
  assert.equal(game.leadSuit, 'S');

  const move = chooseBotMove(game, 1);
  // Must play spade
  assert.ok(move === 'QS' || move === '2S');
  // Since 0 played AS (highest card), bot should safely dump highest spade QS under AS!
  assert.equal(move, 'QS');
});

test('chooseBotMove: cuts when void in lead suit', () => {
  const hands = [
    [getCard('AS'), getCard('KS')],
    [getCard('KH'), getCard('QH')], // Seat 1 has no spades!
  ];
  const game = new GadhaGame(2, { hands });
  game.playCard(0, 'AS');
  assert.equal(game.turnSeat, 1);
  assert.equal(game.leadSuit, 'S');

  const move = chooseBotMove(game, 1);
  // Cut with hearts (single or multi-cut)
  if (Array.isArray(move)) {
    assert.ok(move.every((id) => id.endsWith('H')));
  } else {
    assert.ok(move.endsWith('H'));
  }
});

test('playWithComputer: creates room and starts game with 2 computers', () => {
  const config = loadConfig({ TRICK_PAUSE_MS: '0', AUTOPLAY_DELAY_MS: '10' });
  const manager = new RoomManager(config);
  try {
    const { room, player } = manager.playWithComputer('HumanPlayer', 'sock-1', 2, '😎');
    assert.equal(room.players.length, 3);
    assert.equal(room.players[0].name, 'HumanPlayer');
    assert.equal(room.players[0].isBot, undefined);
    assert.equal(room.players[1].isBot, true);
    assert.equal(room.players[2].isBot, true);
    assert.equal(room.phase, 'playing');
    assert.ok(room.game);
  } finally {
    manager.shutdown();
  }
});

test('palyWithCompute alias: creates room and starts game with 3 computers', () => {
  const config = loadConfig({ TRICK_PAUSE_MS: '0', AUTOPLAY_DELAY_MS: '10' });
  const manager = new RoomManager(config);
  try {
    const { room, player } = manager.palyWithCompute('HumanPlayer', 'sock-1', 3, '👑');
    assert.equal(room.players.length, 4);
    assert.equal(room.players[0].name, 'HumanPlayer');
    assert.equal(room.players[1].isBot, true);
    assert.equal(room.players[2].isBot, true);
    assert.equal(room.players[3].isBot, true);
    assert.equal(room.phase, 'playing');
    assert.ok(room.game);
  } finally {
    manager.shutdown();
  }
});

test('addBot and removeBot in lobby', () => {
  const config = loadConfig({ TRICK_PAUSE_MS: '0' });
  const manager = new RoomManager(config);
  try {
    const { room, player } = manager.createRoom('Host', 'sock-host', 4, '😎');
    assert.equal(room.players.length, 1);

    // Add first bot
    const res1 = manager.addBot(room, player);
    assert.equal(res1.ok, true);
    assert.equal(room.players.length, 2);
    assert.equal(room.players[1].isBot, true);
    const bot1Id = room.players[1].id;

    // Add second bot (2 computers now)
    const res2 = manager.addBot(room, player);
    assert.equal(res2.ok, true);
    assert.equal(room.players.length, 3);
    assert.equal(room.players[2].isBot, true);

    // Add third bot (3 computers now)
    const res3 = manager.addBot(room, player);
    assert.equal(res3.ok, true);
    assert.equal(room.players.length, 4);
    assert.equal(room.players[3].isBot, true);

    // Room is full now (max 4)
    assert.throws(() => manager.addBot(room, player), (err) => err.code === 'ROOM_FULL');

    // Remove first bot
    const rem = manager.removeBot(room, player, bot1Id);
    assert.equal(rem.ok, true);
    assert.equal(room.players.length, 3);
    assert.ok(!room.players.some((p) => p.id === bot1Id));
  } finally {
    manager.shutdown();
  }
});

test('full simulated game: 1 human + 2 computers terminates with Gadha', async () => {
  const config = loadConfig({ TRICK_PAUSE_MS: '0', AUTOPLAY_DELAY_MS: '5' });
  const manager = new RoomManager(config);
  try {
    const { room, player } = manager.playWithComputer('Human', 'sock-human', 2);
    assert.equal(room.players.length, 3);

    // Run until game finishes (with human playing a legal card whenever it is human's turn)
    let turns = 0;
    while (room.phase === 'playing' && turns < 500) {
      turns++;
      if (room.game.phase === 'playing' && room.game.turnSeat === 0) {
        // Human's turn
        const legal = room.game.legalCards(0);
        if (legal.length > 0) {
          manager.play(room, player, legal[0].id);
        }
      }
      // Give async autoplay timer a tick
      await new Promise((r) => setTimeout(r, 15));
    }

    assert.equal(room.phase, 'finished');
    assert.ok(room.game.result);
    assert.ok(room.game.result.gadhaSeat >= 0 && room.game.result.gadhaSeat < 3);
  } finally {
    manager.shutdown();
  }
});

test('full simulated game: 1 human + 3 computers terminates with Gadha', async () => {
  const config = loadConfig({ TRICK_PAUSE_MS: '0', AUTOPLAY_DELAY_MS: '5' });
  const manager = new RoomManager(config);
  try {
    const { room, player } = manager.palyWithCompute('Human', 'sock-human', 3);
    assert.equal(room.players.length, 4);

    let turns = 0;
    while (room.phase === 'playing' && turns < 600) {
      turns++;
      if (room.game.phase === 'playing' && room.game.turnSeat === 0) {
        // Human's turn
        const legal = room.game.legalCards(0);
        if (legal.length > 0) {
          manager.play(room, player, legal[0].id);
        }
      }
      await new Promise((r) => setTimeout(r, 15));
    }

    assert.equal(room.phase, 'finished');
    assert.ok(room.game.result);
    assert.ok(room.game.result.gadhaSeat >= 0 && room.game.result.gadhaSeat < 4);
  } finally {
    manager.shutdown();
  }
});

