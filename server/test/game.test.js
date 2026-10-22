'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GadhaGame, trickWinner } = require('../src/engine/game');
const { getCard, createDeck } = require('../src/engine/cards');
const rules = require('../src/engine/rules');

const cards = (...ids) => ids.map(getCard);
const codeOf = (fn) => {
  try { fn(); } catch (e) { return e.code; }
  return null;
};

// ---------- starting the game ----------

test('a real deal starts with the holder of the Ace of Spades, who may only play it', () => {
  for (let n = 2; n <= 13; n++) {
    const game = new GadhaGame(n);
    const starter = game.hands.findIndex((h) => h.some((c) => c.id === 'AS'));
    assert.equal(game.turnSeat, starter);
    assert.deepEqual(game.legalCards(starter).map((c) => c.id), ['AS']);
    // any other card is rejected, even though the starter holds plenty
    const other = game.hands[starter].find((c) => c.id !== 'AS');
    assert.equal(codeOf(() => game.playCard(starter, other.id)), 'MUST_PLAY_ACE_OF_SPADES');
    game.playCard(starter, 'AS');
    assert.equal(game.leadSuit, 'S');
  }
});

test('every card is dealt exactly once', () => {
  const game = new GadhaGame(5);
  const all = game.hands.flat().map((c) => c.id);
  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
});

test('rejects bad player counts', () => {
  for (const n of [0, 1, 27, 2.5]) assert.equal(codeOf(() => new GadhaGame(n)), 'BAD_PLAYER_COUNT');
});

// ---------- legal moves ----------

function rigged() {
  // seat0: AS 5S 9H | seat1: KS 2S QH | seat2: 3D 4D 6C
  return new GadhaGame(3, {
    hands: [cards('AS', '5S', '9H'), cards('KS', '2S', 'QH'), cards('3D', '4D', '6C')],
  });
}

test('must follow the lead suit when able', () => {
  const g = rigged();
  g.playCard(0, 'AS');
  assert.deepEqual(g.legalCards(1).map((c) => c.id).sort(), ['2S', 'KS']);
  assert.equal(codeOf(() => g.playCard(1, 'QH')), 'MUST_FOLLOW_SUIT');
  g.playCard(1, '2S');
});

test('may play any card when void in the lead suit', () => {
  const g = rigged();
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  assert.equal(g.legalCards(2).length, 3);
  assert.doesNotThrow(() => g.playCard(2, '6C'));
});

test('leader of a round may lead any card', () => {
  const g = rigged();
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  g.playCard(2, '3D'); // seat 2 cuts; penalty seat 0 picks up cards and leads next
  assert.equal(g.turnSeat, 0);
  assert.equal(g.legalCards(0).length, 5);
  assert.doesNotThrow(() => g.playCard(0, '5S'));
});

test('out-of-turn plays are rejected', () => {
  const g = rigged();
  assert.equal(codeOf(() => g.playCard(1, 'KS')), 'NOT_YOUR_TURN');
  assert.equal(codeOf(() => g.playCard(2, '3D')), 'NOT_YOUR_TURN');
  g.playCard(0, 'AS');
  assert.equal(codeOf(() => g.playCard(0, '5S')), 'NOT_YOUR_TURN'); // cannot play twice in a row
});

test('cannot play a card you do not hold, a made-up card, or garbage', () => {
  const g = rigged();
  g.playCard(0, 'AS');
  assert.equal(codeOf(() => g.playCard(1, '3D')), 'CARD_NOT_IN_HAND'); // someone else's card
  assert.equal(codeOf(() => g.playCard(1, 'ZZ')), 'CARD_NOT_IN_HAND');
  assert.equal(codeOf(() => g.playCard(1, undefined)), 'CARD_NOT_IN_HAND');
  assert.equal(codeOf(() => g.playCard(1, { id: 'KS' })), 'CARD_NOT_IN_HAND');
  assert.equal(codeOf(() => g.playCard(7, 'KS')), 'BAD_SEAT');
});

test('the same physical card cannot be played twice', () => {
  const g = new GadhaGame(3, {
    hands: [cards('AS', '5S', '9H'), cards('KS', '2S', 'QH'), cards('QS', '4D', '6C')],
  });
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  g.playCard(2, 'QS');
  // All followed suit: AS is now discarded, not in any hand, and seat 0 leads next
  assert.equal(g.turnSeat, 0);
  assert.equal(codeOf(() => g.playCard(0, 'AS')), 'CARD_NOT_IN_HAND');
  const everything = [...g.hands.flat(), ...g.discarded, ...g.trick.map((p) => p.card)];
  assert.equal(new Set(everything.map((c) => c.id)).size, everything.length);
});

// ---------- round winners ----------

test('trickWinner: highest lead-suit card wins; off-suit cards never beat it', () => {
  const plays = [
    { seat: 0, card: getCard('7S') },
    { seat: 1, card: getCard('AH') }, // higher rank but wrong suit
    { seat: 2, card: getCard('9S') },
    { seat: 3, card: getCard('KD') },
  ];
  assert.equal(trickWinner(plays, 'S'), 2);
});

test('trickWinner: lead card wins when everyone else is off suit', () => {
  const plays = [
    { seat: 2, card: getCard('2C') },
    { seat: 3, card: getCard('AS') },
    { seat: 0, card: getCard('AH') },
  ];
  assert.equal(trickWinner(plays, 'C'), 2);
});

test('trickWinner honours the full ranking order', () => {
  const order = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  for (let i = 1; i < order.length; i++) {
    const plays = [
      { seat: 0, card: getCard(`${order[i - 1]}H`) },
      { seat: 1, card: getCard(`${order[i]}H`) },
    ];
    assert.equal(trickWinner(plays, 'H'), 1);
    assert.equal(trickWinner([...plays].reverse(), 'H'), 1);
  }
});

test('normal trick: cards are discarded and highest lead-suit player leads next', () => {
  const g = new GadhaGame(3, {
    hands: [cards('AS', '5S', '9H'), cards('KS', '2S', 'QH'), cards('QS', '4D', '6C')],
  });
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  const outcome = g.playCard(2, 'QS');
  assert.equal(outcome.trickComplete, true);
  assert.equal(outcome.isCut, false);
  assert.equal(outcome.winnerSeat, 0);
  assert.equal(g.discarded.length, 3);
  assert.equal(g.turnSeat, 0);
  assert.equal(g.trick.length, 0);
  assert.equal(g.leadSuit, null);
  assert.equal(g.lastTrick.winnerSeat, 0);
  assert.equal(g.hands[0].length, 2);
});

test('cut mechanic: round ends immediately, highest lead-suit card picks up cards into hand, penalty seat leads next', () => {
  const g = rigged(); // seat0: AS 5S 9H | seat1: KS 2S QH | seat2: 3D 4D 6C
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  const outcome = g.playCard(2, '3D');
  assert.equal(outcome.trickComplete, true);
  assert.equal(outcome.isCut, true);
  assert.equal(outcome.cutterSeat, 2);
  assert.equal(outcome.penaltySeat, 0); // seat 0 played AS
  // seat 0 had 3 cards, played 1, picked up 3 (AS, KS, 3D) -> 5 cards
  assert.equal(g.hands[0].length, 5);
  // penalty seat (seat 0) leads next
  assert.equal(g.turnSeat, 0);
  assert.equal(g.trick.length, 0);
  assert.equal(g.leadSuit, null);
});

test('multi-card cut mechanic: cutter can play multiple cards of same suit, highest lead card collects all', () => {
  const g = rigged(); // seat0: AS 5S 9H | seat1: KS 2S QH | seat2: 3D 4D 6C
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  // seat 2 is void in Spades, plays two Diamonds ('3D', '4D') at once!
  const outcome = g.playCard(2, ['3D', '4D']);
  assert.equal(outcome.trickComplete, true);
  assert.equal(outcome.isCut, true);
  assert.equal(outcome.cutterSeat, 2);
  assert.equal(outcome.penaltySeat, 0); // seat 0 played AS
  // seat 0 had 3 cards, played 1, picked up 4 (AS, KS, 3D, 4D) -> 6 cards
  assert.equal(g.hands[0].length, 6);
  // cutter (seat 2) played 2 cards, has 1 card left ('6C')
  assert.equal(g.hands[2].length, 1);
  assert.equal(g.hands[2][0].id, '6C');
  // penalty seat (seat 0) leads next!
  assert.equal(g.turnSeat, 0);
  assert.equal(g.trick.length, 0);
  assert.equal(g.leadSuit, null);
});

test('multi-card cut validation: rejects different suits, multi-card lead, or multi-card when holding lead suit', () => {
  const g = rigged(); // seat0: AS 5S 9H | seat1: KS 2S QH | seat2: 3D 4D 6C
  // Opener must be single AS
  assert.equal(codeOf(() => g.playCard(0, ['AS', '5S'])), 'MUST_PLAY_ACE_OF_SPADES');
  g.playCard(0, 'AS');
  // Seat 1 has spades, cannot play multi-card or off-suit
  assert.equal(codeOf(() => g.playCard(1, ['KS', '2S'])), 'MUST_FOLLOW_SUIT');
  g.playCard(1, 'KS');
  // Seat 2 is void in Spades, but tries to play different suits ('3D' and '6C')
  assert.equal(codeOf(() => g.playCard(2, ['3D', '6C'])), 'MUST_BE_SAME_SUIT');
  // Cut with 3D -> round resolves and seat 0 (penalty seat) leads next
  g.playCard(2, '3D');
  // Seat 0 leads next trick, cannot lead multiple cards
  assert.equal(codeOf(() => g.playCard(0, ['5S', '9H'])), 'CANNOT_PLAY_MULTIPLE_CARDS');
});


test('seat order is clockwise from the leader and wraps around', () => {
  const g = new GadhaGame(4, {
    hands: [cards('KS', '2C'), cards('QS', '3C'), cards('AS', '4C'), cards('JS', '5C')],
  });
  assert.equal(g.turnSeat, 2);
  g.playCard(2, 'AS');
  assert.equal(g.turnSeat, 3);
  g.playCard(3, 'JS');
  assert.equal(g.turnSeat, 0);
  g.playCard(0, 'KS');
  assert.equal(g.turnSeat, 1);
  g.playCard(1, 'QS');
  assert.equal(g.lastTrick.winnerSeat, 2); // only spade is AS
  assert.equal(g.turnSeat, 2);
});

test('autoResolve:false keeps the full round on the table until resolveTrick()', () => {
  const g = rigged();
  g.playCard(0, 'AS', { autoResolve: false });
  g.playCard(1, 'KS', { autoResolve: false });
  const out = g.playCard(2, '3D', { autoResolve: false });
  assert.equal(out.trickComplete, true);
  assert.equal(out.isCut, true);
  assert.equal(g.phase, 'resolving');
  assert.equal(g.trick.length, 3);
  assert.equal(g.pendingWinner(), 0);
  assert.equal(codeOf(() => g.playCard(0, '5S')), 'ROUND_RESOLVING');
  assert.equal(g.resolveTrick(), 0); // penalty recipient leads
  assert.equal(g.phase, 'playing');
  assert.equal(codeOf(() => g.resolveTrick()), 'NOTHING_TO_RESOLVE');
});

// ---------- game ending ----------

test('game ends when one player is left holding cards; that player is the Gadha', () => {
  // seat0 has 2 cards, seat1 has 1, seat2 has 1: after round 1 only seat0 holds cards.
  const g = new GadhaGame(3, {
    hands: [cards('AS', '9H'), cards('KS'), cards('QS')],
  });
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  g.playCard(2, 'QS');
  assert.equal(g.phase, 'finished');
  assert.deepEqual(g.result.gadhaSeat, 0);
  assert.equal(g.result.reason, 'LAST_HOLDER');
  assert.equal(codeOf(() => g.playCard(0, '9H')), 'GAME_OVER');
});

test('players who run out of cards sit out later rounds', () => {
  // seat2 has one card, seats 0 and 1 have three each.
  const g = new GadhaGame(3, {
    hands: [cards('AS', '5H', '4H'), cards('KS', '6H', '3H'), cards('QS')],
  });
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  g.playCard(2, 'QS'); // seat 0 wins, seat 2 is now out
  assert.equal(g.phase, 'playing');
  assert.deepEqual(g.roundSeats, [0, 1]);
  g.playCard(0, '5H');
  assert.equal(g.turnSeat, 1);
  g.playCard(1, '6H'); // seat 1 wins; round had only two players
  assert.equal(g.turnSeat, 1);
  assert.deepEqual(g.roundSeats, [1, 0]);
});

test('a winner with no cards left hands the lead to the next seat that has cards', () => {
  const g = new GadhaGame(3, {
    hands: [cards('AS'), cards('2S', '9H'), cards('3S', '8H')],
  });
  g.playCard(0, 'AS');
  g.playCard(1, '2S');
  g.playCard(2, '3S'); // seat 0 wins but is out of cards
  assert.equal(g.phase, 'playing');
  assert.equal(g.turnSeat, 1); // next clockwise with cards
  assert.deepEqual(g.roundSeats, [1, 2]);
});

test('if every hand empties in the same round, the last round winner is the Gadha (documented fallback)', () => {
  const g = new GadhaGame(2, { hands: [cards('AS'), cards('KS')] });
  g.playCard(0, 'AS');
  g.playCard(1, 'KS');
  assert.equal(g.phase, 'finished');
  assert.equal(g.result.gadhaSeat, 0);
});

test('rules.isGameOver / determineGadha can be used standalone', () => {
  const fake = (hands, lastTrickWinner) => ({
    lastTrickWinner,
    seatsWithCards: () => hands.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0),
  });
  assert.equal(rules.isGameOver(fake([2, 1, 3], 0)), false);
  assert.equal(rules.isGameOver(fake([0, 0, 3], 0)), true);
  assert.equal(rules.isGameOver(fake([0, 0, 0], 1)), true);
  assert.deepEqual(rules.determineGadha(fake([0, 0, 3], 0)), { seat: 2, reason: 'LAST_HOLDER' });
  assert.deepEqual(rules.determineGadha(fake([0, 0, 0], 1)), { seat: 1, reason: 'LAST_TRICK_WINNER' });
});

// ---------- full random games ----------

function playRandomGame(playerCount, rng) {
  const game = new GadhaGame(playerCount);
  let safety = 2500;
  while (game.phase !== 'finished') {
    assert.ok(safety-- > 0, 'game did not terminate');
    const seat = game.turnSeat;
    const legal = game.legalCards(seat);
    assert.ok(legal.length > 0, 'a player whose turn it is must always have a legal card');
    const pick = legal[rng(legal.length)];
    game.playCard(seat, pick.id);
  }
  return { game };
}

test('random complete games (2-13 players) always terminate with a Gadha and conserve all 52 cards', () => {
  let x = 12345;
  const rng = (n) => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x % n;
  };
  for (let n = 2; n <= 13; n++) {
    for (let rep = 0; rep < 20; rep++) {
      const { game } = playRandomGame(n, rng);
      const remaining = game.hands.flat().length;
      assert.equal(remaining + game.discarded.length, 52, `n=${n}: all 52 cards conserved`);
      const holders = game.seatsWithCards();
      if (holders.length === 1) {
        assert.equal(game.result.reason, 'LAST_HOLDER');
        assert.equal(game.result.gadhaSeat, holders[0]);
      }
      assert.ok(game.result && game.result.gadhaSeat >= 0 && game.result.gadhaSeat < n);
    }
  }
});

test('the first card of every random game is the Ace of Spades', () => {
  for (let i = 0; i < 50; i++) {
    const g = new GadhaGame(2 + (i % 9));
    g.playCard(g.turnSeat, 'AS');
    assert.equal(g.trick[0].card.id, 'AS');
  }
});
