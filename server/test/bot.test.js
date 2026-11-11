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

test('chooseBotMove: follows suit and dumps high card below leader safely', () => {
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
  // Must play spade; since Seat 0 played AS (highest card), bot should safely dump highest spade QS under AS!
  assert.equal(move, 'QS');
});

test('chooseBotMove: in last seat of a trick, cashes winning Ace knowing no cut can happen', () => {
  // 3 players: Seat 0 leads 5H, Seat 1 plays 9H, Seat 2 (Bot) holds [AH, 2H, KD]
  const hands = [
    [getCard('AS'), getCard('5H')],
    [getCard('2S'), getCard('9H')],
    [getCard('3S'), getCard('AH'), getCard('2H'), getCard('KD')],
  ];
  const game = new GadhaGame(3, { hands });
  game.awaitingFirstCard = false;
  // Start round led by seat 0
  game._startRound(0);
  game.playCard(0, '5H');
  game.playCard(1, '9H');
  assert.equal(game.turnSeat, 2);

  // Seat 2 is the last player in the trick! No cut is possible.
  // Pro bot should play AH to win the trick and discard the high Ace liability safely!
  const move = chooseBotMove(game, 2);
  assert.equal(move, 'AH');
});

test('chooseBotMove: avoids leading suit that opponent is known to be void in', () => {
  // 3 players: Seat 1 is known void in Spades. Seat 0 (Bot) holds [AS, 2S, 3H, 4H]
  const hands = [
    [getCard('AS'), getCard('2S'), getCard('3H'), getCard('4H')],
    [getCard('5D'), getCard('6D')],
    [getCard('7D'), getCard('8D')],
  ];
  const game = new GadhaGame(3, { hands });
  game.awaitingFirstCard = false;
  // Seat 1 is marked as void in Spades
  game.knownVoids[1].add('S');

  game._startRound(0);
  // Bot should NOT lead AS or Spades because Seat 1 is void and will cut! Bot should lead Hearts!
  const move = chooseBotMove(game, 0);
  assert.ok(move.endsWith('H'), `Bot should lead Hearts to avoid cut, but led ${move}`);
});

test('chooseBotMove: leads singleton to create a void when safe', () => {
  // Bot holds 1 Club [3C] and multiple Spades [5S, 6S, 7S]. No opponent is void in Clubs.
  const hands = [
    [getCard('3C'), getCard('5S'), getCard('6S'), getCard('7S')],
    [getCard('4C'), getCard('8S'), getCard('9S')],
    [getCard('AS'), getCard('5C'), getCard('10S'), getCard('JS')],
  ];
  const game = new GadhaGame(3, { hands });
  game.awaitingFirstCard = false;
  game._startRound(0);

  // Bot should lead 3C to shed its only Club and create a void!
  const move = chooseBotMove(game, 0);
  assert.equal(move, '3C');
});

test('chooseBotMove: cuts with all cards of a suit to empty hand completely', () => {
  // Bot has 2 cards left: [KD, QD]. Seat 0 leads AS. Bot is void in Spades.
  const hands = [
    [getCard('AS'), getCard('6S')],
    [getCard('KD'), getCard('QD')],
  ];
  const game = new GadhaGame(2, { hands });
  game.awaitingFirstCard = false;
  game._startRound(0);
  game.playCard(0, 'AS');

  // Bot is void in Spades and can dump BOTH [KD, QD] to finish all cards and win!
  const move = chooseBotMove(game, 1);
  assert.deepEqual(move, ['KD', 'QD']);
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
