'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SUITS, RANKS, RANK_VALUE, createDeck, getCard, shuffle, dealCards, compareRank, sortHand,
} = require('../src/engine/cards');

// Small deterministic PRNG so shuffle tests are reproducible.
function seededRng(seed) {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

test('deck has exactly 52 unique cards, 13 per suit, no jokers', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
  for (const suit of SUITS) assert.equal(deck.filter((c) => c.suit === suit).length, 13);
  assert.deepEqual(SUITS, ['S', 'H', 'D', 'C']);
  assert.ok(deck.every((c) => RANKS.includes(c.rank) && SUITS.includes(c.suit)));
});

test('ranking runs A > K > Q > J > 10 > ... > 2', () => {
  const order = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  assert.deepEqual([...RANKS], order);
  for (let i = 0; i < order.length - 1; i++) {
    assert.ok(RANK_VALUE[order[i]] > RANK_VALUE[order[i + 1]], `${order[i]} should outrank ${order[i + 1]}`);
  }
  assert.ok(compareRank(getCard('AS'), getCard('KS')) > 0);
  assert.ok(compareRank(getCard('2H'), getCard('3H')) < 0);
  assert.equal(compareRank(getCard('QH'), getCard('QC')), 0);
});

test('getCard only accepts real card ids', () => {
  assert.equal(getCard('AS').suit, 'S');
  assert.equal(getCard('10H').rank, '10');
  for (const bad of ['', 'XX', '1S', '11H', 'as', null, undefined, 5, {}, ['AS'], 'AS ']) {
    assert.equal(getCard(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('shuffle keeps all 52 cards, does not mutate its input, and is reproducible per rng', () => {
  const deck = createDeck();
  const before = deck.map((c) => c.id).join();
  const a = shuffle(deck, seededRng(1));
  const b = shuffle(deck, seededRng(1));
  const c = shuffle(deck, seededRng(2));
  assert.equal(deck.map((x) => x.id).join(), before, 'input untouched');
  assert.equal(a.length, 52);
  assert.equal(new Set(a.map((x) => x.id)).size, 52);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notEqual(a.map((x) => x.id).join(), before);
});

test('default (crypto) shuffle produces different orders and valid permutations', () => {
  const deck = createDeck();
  const s1 = shuffle(deck);
  const s2 = shuffle(deck);
  assert.equal(new Set(s1.map((c) => c.id)).size, 52);
  assert.notEqual(s1.map((c) => c.id).join(), s2.map((c) => c.id).join());
});

test('shuffle is roughly uniform: Ace of Spades lands everywhere', () => {
  const deck = createDeck();
  const rng = seededRng(99);
  const positions = new Set();
  for (let i = 0; i < 2000; i++) positions.add(shuffle(deck, rng).findIndex((c) => c.id === 'AS'));
  assert.ok(positions.size > 45, `AS reached only ${positions.size} distinct positions`);
});

test('dealing gives everyone an even share; extras go to the first seats, one at a time', () => {
  const deck = shuffle(createDeck());
  for (let n = 2; n <= 13; n++) {
    const hands = dealCards(deck, n);
    const base = Math.floor(52 / n);
    const extra = 52 % n;
    assert.equal(hands.length, n);
    hands.forEach((h, seat) => assert.equal(h.length, base + (seat < extra ? 1 : 0), `n=${n} seat=${seat}`));
    const all = hands.flat().map((c) => c.id);
    assert.equal(all.length, 52);
    assert.equal(new Set(all).size, 52, 'no card dealt twice');
    // consistent dealing order: card i goes to seat i % n
    deck.forEach((card, i) => assert.equal(hands[i % n][Math.floor(i / n)].id, card.id));
  }
});

test('dealing rejects impossible player counts', () => {
  const deck = createDeck();
  for (const n of [0, 1, -3, 1.5, NaN, 27, '4']) assert.throws(() => dealCards(deck, n), RangeError);
});

test('sortHand groups by suit and orders high to low, without mutating', () => {
  const hand = ['2H', 'AS', '5S', 'KH', '3C', 'JD'].map(getCard);
  const sorted = sortHand(hand);
  assert.deepEqual(sorted.map((c) => c.id), ['AS', '5S', 'KH', '2H', 'JD', '3C']);
  assert.deepEqual(hand.map((c) => c.id), ['2H', 'AS', '5S', 'KH', '3C', 'JD']);
});
