'use strict';
const { GadhaError } = require('../errors');
const {
  MIN_PLAYERS, ABSOLUTE_MAX_PLAYERS, RANK_VALUE, createDeck, dealCards, getCard, shuffle, sortHand,
} = require('./cards');
const rules = require('./rules');

/**
 * Winner of a finished round: the highest card of the lead suit.
 * Cards of any other suit can never win, whatever their rank. Returns the winning seat.
 */
function trickWinner(plays, leadSuit) {
  let best = null;
  for (const p of plays) {
    if (p.card.suit !== leadSuit) continue;
    if (best === null || RANK_VALUE[p.card.rank] > RANK_VALUE[best.card.rank]) best = p;
  }
  return best.seat;
}

/**
 * Authoritative game state for one table. Seats are 0..n-1 (clockwise order).
 * Every mutation goes through playCard()/resolveTrick(); invalid input throws GadhaError.
 *
 * phase: 'playing' -> 'resolving' (round complete, cards still on table) -> 'playing' ... -> 'finished'
 */
class GadhaGame {
  /**
   * @param {number} playerCount 2..26
   * @param {{hands?: Card[][], rng?: (n:number)=>number}} [opts] `hands` lets tests rig a deal.
   */
  constructor(playerCount, opts = {}) {
    if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > ABSOLUTE_MAX_PLAYERS) {
      throw new GadhaError('BAD_PLAYER_COUNT', `Player count must be ${MIN_PLAYERS}-${ABSOLUTE_MAX_PLAYERS}`);
    }
    this.playerCount = playerCount;
    this.hands = opts.hands
      ? opts.hands.map((h) => [...h])
      : dealCards(shuffle(createDeck(), opts.rng), playerCount);
    this.piles = Array.from({ length: playerCount }, () => []);
    this.discarded = [];
    this.finishOrder = [];
    this.trick = []; // [{ seat, card }] cards on the table this round
    this.leadSuit = null;
    this.round = 1;
    this.phase = 'playing';
    this.awaitingFirstCard = true; // the very first card of the game must be A♠
    this.lastTrick = null; // { seq, isCut, cutterSeat, penaltySeat, winnerSeat, plays }
    this.lastTrickWinner = null;
    this.trickSeq = 0;
    this.result = null; // { gadhaSeat, reason, finishOrder }

    const starter = this.hands.findIndex((h) => h.some((c) => c.id === 'AS'));
    this._startRound(starter);
  }

  seatsWithCards() {
    return this.hands.map((h, seat) => (h.length > 0 ? seat : -1)).filter((s) => s >= 0);
  }

  /** Begin a round led by `leaderSeat`; seats without cards sit it out. */
  _startRound(leaderSeat) {
    const n = this.playerCount;
    this.roundSeats = [];
    for (let k = 0; k < n; k++) {
      const seat = (leaderSeat + k) % n;
      if (this.hands[seat].length > 0) this.roundSeats.push(seat);
    }
    this.turnSeat = this.roundSeats[0];
    this.trick = [];
    this.leadSuit = null;
    this.phase = 'playing';
  }

  /** Cards `seat` may legally play right now (empty if it is not their turn). */
  legalCards(seat) {
    if (this.phase !== 'playing' || seat !== this.turnSeat) return [];
    const hand = this.hands[seat];
    if (this.awaitingFirstCard) return hand.filter((c) => c.id === 'AS');
    if (this.trick.length === 0) return [...hand]; // leader may lead anything
    const sameSuit = hand.filter((c) => c.suit === this.leadSuit);
    return sameSuit.length > 0 ? sameSuit : [...hand]; // must follow suit if able
  }

  pendingWinner() {
    if (this.phase !== 'resolving' || !this.lastTrick) return null;
    return this.lastTrick.isCut ? this.lastTrick.penaltySeat : this.lastTrick.winnerSeat;
  }

  /**
   * Play a card (or multiple cards of the same suit on a cut).
   * `cardInput` can be a single card ID string or an array of card ID strings.
   * Throws GadhaError on any rule violation.
   * With autoResolve:false a completed round stays on the table (phase 'resolving')
   * until resolveTrick() is called, so clients can show who won / who was penalized.
   */
  playCard(seat, cardInput, { autoResolve = true } = {}) {
    if (this.phase === 'finished') throw new GadhaError('GAME_OVER', 'The game is over');
    if (this.phase === 'resolving') throw new GadhaError('ROUND_RESOLVING', 'Wait for the round to finish');
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.playerCount) {
      throw new GadhaError('BAD_SEAT', 'Unknown seat');
    }
    if (seat !== this.turnSeat) throw new GadhaError('NOT_YOUR_TURN', 'It is not your turn');

    const cardIds = Array.isArray(cardInput) ? cardInput : [cardInput];
    if (cardIds.length === 0) throw new GadhaError('BAD_CARD', 'Invalid card selection');

    if (new Set(cardIds).size !== cardIds.length) {
      throw new GadhaError('DUPLICATE_CARD', 'Cannot play the same card twice');
    }

    const cards = [];
    for (const id of cardIds) {
      const card = typeof id === 'string' ? this.hands[seat].find((c) => c.id === id) : undefined;
      if (!card) throw new GadhaError('CARD_NOT_IN_HAND', 'You do not hold that card');
      cards.push(card);
    }

    if (this.awaitingFirstCard) {
      if (cards.length !== 1 || cards[0].id !== 'AS') {
        throw new GadhaError('MUST_PLAY_ACE_OF_SPADES', 'The game must start with the Ace of Spades');
      }
    }

    // Leader leading a fresh trick
    if (this.trick.length === 0) {
      if (cards.length > 1) {
        throw new GadhaError('CANNOT_PLAY_MULTIPLE_CARDS', 'Multi-card play is only allowed when cutting');
      }
      this.leadSuit = cards[0].suit;
    } else {
      // Trick already in progress with a leadSuit
      const hasLeadSuit = this.hands[seat].some((c) => c.suit === this.leadSuit);
      if (hasLeadSuit) {
        if (cards.length > 1 || cards[0].suit !== this.leadSuit) {
          throw new GadhaError('MUST_FOLLOW_SUIT', 'You must follow the lead suit');
        }
      } else {
        // Player is VOID in leadSuit -> CUT
        if (cards.length > 1) {
          const cutSuit = cards[0].suit;
          if (!cards.every((c) => c.suit === cutSuit)) {
            throw new GadhaError('MUST_BE_SAME_SUIT', 'Multiple cut cards must be of the same suit');
          }
        }
      }
    }

    const playedSet = new Set(cards);
    this.hands[seat] = this.hands[seat].filter((c) => !playedSet.has(c));
    for (const card of cards) {
      this.trick.push({ seat, card });
    }
    this.awaitingFirstCard = false; // A♠ (the only legal opener) has now been played

    // Check if this play was a CUT (player played off-suit)
    const isCut = cards[0].suit !== this.leadSuit;

    // A player who played their last card (0 cards left) is safe and CANNOT be cut
    let penaltySeat = null;
    if (isCut) {
      let best = null;
      for (const p of this.trick) {
        if (p.card.suit !== this.leadSuit) continue;
        if (this.hands[p.seat].length === 0) continue; // safe! cannot be cut
        if (best === null || RANK_VALUE[p.card.rank] > RANK_VALUE[best.card.rank]) best = p;
      }
      penaltySeat = best ? best.seat : null;
    }

    if (isCut && penaltySeat !== null) {
      // The round ends immediately upon the cut!
      const cutterSeat = seat;
      this.lastTrick = {
        seq: ++this.trickSeq,
        isCut: true,
        cutterSeat,
        penaltySeat,
        winnerSeat: cutterSeat,
        plays: this.trick.map((p) => ({ ...p })),
      };
      this.phase = 'resolving';
      const outcome = {
        trickComplete: true,
        isCut: true,
        cutterSeat,
        penaltySeat,
        winnerSeat: cutterSeat,
      };
      if (autoResolve) {
        this.resolveTrick();
        outcome.finished = this.phase === 'finished';
      }
      return outcome;
    }

    // Normal play (followed suit): check if everyone in this round has played
    const playedSeats = new Set(this.trick.map((p) => p.seat));
    if (playedSeats.size < this.roundSeats.length) {
      this.turnSeat = this.roundSeats[playedSeats.size];
      return { trickComplete: false, isCut: false };
    }

    // Everyone followed suit (or cut with no eligible penalty recipient): highest lead-suit card wins the round
    let winnerSeat = null;
    for (const p of this.trick) {
      if (p.card.suit !== this.leadSuit) continue;
      if (winnerSeat === null || RANK_VALUE[p.card.rank] > RANK_VALUE[this.trick.find((x) => x.seat === winnerSeat).card.rank]) {
        winnerSeat = p.seat;
      }
    }
    if (winnerSeat === null) winnerSeat = seat;

    this.lastTrick = {
      seq: ++this.trickSeq,
      isCut: false,
      cutterSeat: null,
      penaltySeat: null,
      winnerSeat,
      plays: this.trick.map((p) => ({ ...p })),
    };
    this.phase = 'resolving';
    const outcome = { trickComplete: true, isCut: false, winnerSeat };
    if (autoResolve) {
      this.resolveTrick();
      outcome.finished = this.phase === 'finished';
    }
    return outcome;
  }

  /**
   * Resolve the finished round:
   *  - On a cut: penaltySeat picks up ALL cards played in this round into their hand.
   *  - On a normal round: cards are discarded from play.
   */
  resolveTrick() {
    if (this.phase !== 'resolving') throw new GadhaError('NOTHING_TO_RESOLVE', 'No round to resolve');
    const { isCut, penaltySeat, cutterSeat, winnerSeat } = this.lastTrick;

    if (isCut && penaltySeat !== null && penaltySeat !== undefined) {
      this.hands[penaltySeat].push(...this.trick.map((p) => p.card));
      this.hands[penaltySeat] = sortHand(this.hands[penaltySeat]);
      this.lastTrickWinner = cutterSeat;
    } else {
      this.discarded.push(...this.trick.map((p) => p.card));
      this.lastTrickWinner = winnerSeat;
    }

    this.trick = [];
    this.leadSuit = null;

    // Track finish order for players who are out of cards
    for (let s = 0; s < this.playerCount; s++) {
      if (this.hands[s].length === 0) {
        if (!this.finishOrder.includes(s)) this.finishOrder.push(s);
      } else {
        this.finishOrder = this.finishOrder.filter((seat) => seat !== s);
      }
    }

    if (rules.isGameOver(this)) {
      const { seat, reason } = rules.determineGadha(this);
      this.result = {
        gadhaSeat: seat,
        reason,
        finishOrder: [...this.finishOrder.filter((s) => s !== seat), seat],
      };
      this.phase = 'finished';
      return isCut ? cutterSeat : winnerSeat;
    }

    // Next round leader:
    // If cut: the cutter leads. If cutter has no cards left, next clockwise seat that has cards.
    // If normal: trick winner leads. If winner has no cards left, next clockwise seat that has cards.
    let leader = isCut && penaltySeat !== null ? cutterSeat : winnerSeat;
    while (this.hands[leader].length === 0) {
      leader = (leader + 1) % this.playerCount;
    }

    this.round += 1;
    this._startRound(leader);
    return isCut ? cutterSeat : winnerSeat;
  }
}

module.exports = { GadhaGame, trickWinner };
