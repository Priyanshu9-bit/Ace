'use strict';
const crypto = require('node:crypto');

const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
// Highest -> lowest.
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
// Higher number beats lower number (A = 13 ... 2 = 1).
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, RANKS.length - i]));

const MIN_PLAYERS = 2;
const ABSOLUTE_MAX_PLAYERS = 26; // at least 2 cards each

// Every card exists exactly once, as a frozen object looked up by id ("AS", "10H").
const CARD_BY_ID = new Map();
for (const suit of SUITS) {
  for (const rank of RANKS) {
    const id = `${rank}${suit}`;
    CARD_BY_ID.set(id, Object.freeze({ id, rank, suit }));
  }
}

/** Returns the card for a valid id string, otherwise null. Never throws. */
function getCard(id) {
  return typeof id === 'string' ? CARD_BY_ID.get(id) || null : null;
}

/** Fresh ordered 52-card deck (no jokers). */
function createDeck() {
  return [...CARD_BY_ID.values()];
}

/** Cryptographically secure integer in [0, n). */
const secureInt = (n) => crypto.randomInt(n);

/** Unbiased Fisher–Yates shuffle. Returns a new array. `rng(n)` must return an int in [0, n). */
function shuffle(deck, rng = secureInt) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Deal one card at a time in seat order (seat 0, 1, 2 ... wrapping), so when 52 does not
 * divide evenly the first (52 % n) seats get one extra card. Returns an array of hands.
 */
function dealCards(deck, playerCount) {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > ABSOLUTE_MAX_PLAYERS) {
    throw new RangeError(`Player count must be an integer between ${MIN_PLAYERS} and ${ABSOLUTE_MAX_PLAYERS}`);
  }
  const hands = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, i) => hands[i % playerCount].push(card));
  return hands;
}

/** >0 if a outranks b, <0 if b outranks a, 0 if equal rank (suit is ignored). */
const compareRank = (a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank];

/** Display order: suits S,H,D,C; within a suit high -> low. Does not mutate. */
function sortHand(hand) {
  return [...hand].sort(
    (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || compareRank(b, a),
  );
}

module.exports = {
  SUITS, SUIT_SYMBOLS, RANKS, RANK_VALUE, MIN_PLAYERS, ABSOLUTE_MAX_PLAYERS,
  getCard, createDeck, shuffle, dealCards, compareRank, sortHand,
};
