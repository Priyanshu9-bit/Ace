'use strict';
const { RANK_VALUE } = require('./cards');

/**
 * Helper to determine which active opponents are known to be void in a suit.
 */
function getSeatsVoidInSuit(game, suit, excludeSeat = -1) {
  const seats = [];
  if (!game || !game.knownVoids) return seats;
  for (let s = 0; s < game.playerCount; s++) {
    if (s === excludeSeat) continue;
    if (game.hands[s].length === 0) continue; // Safe players are out
    if (game.knownVoids[s] && game.knownVoids[s].has(suit)) {
      seats.push(s);
    }
  }
  return seats;
}

/**
 * Checks if a card is the highest remaining card of its suit in the entire game.
 */
function isBossCard(game, card) {
  const cardRankVal = RANK_VALUE[card.rank];
  if (cardRankVal === 13) return true; // Ace is always the boss
  // Check if any higher card of this suit is already in discard or trick
  const suitDiscards = game.discarded.filter((c) => c.suit === card.suit);
  const higherDiscards = suitDiscards.filter((c) => RANK_VALUE[c.rank] > cardRankVal);
  // If higher cards (e.g. Ace for King) are in discard, this card is effectively the boss
  return higherDiscards.length >= (13 - cardRankVal);
}

/**
 * Professional-grade decision making for computer (bot) players in Gadhaa.
 *
 * Employs competitive human master strategies:
 *  1. Memory & Void Awareness: Tracks known voids so it never recklessly leads into an opponent's cut.
 *  2. Void Creation: Prioritizes shedding singletons/doubletons early to create cutting power.
 *  3. Boss Cashing: Cashes safe boss cards (Aces/Kings) when no cut is possible to discard high liabilities.
 *  4. Last-Seat Exploitation: When acting as the final player in a trick where no cut can happen,
 *     it dumps heavy high cards safely.
 *  5. Strategic Ducking: Always plays below the current highest card when possible to let opponents eat potential cuts.
 *  6. Devastating Multi-Cuts: Evaluates multi-card dumps to eliminate suits, empty its hand, or trap opponents near escape.
 */
function chooseBotMove(game, seat) {
  if (!game || game.phase !== 'playing') return null;
  const legal = game.legalCards(seat);
  if (!legal || legal.length === 0) return null;

  // 1. Mandatory opening card of the game: Ace of Spades
  if (game.awaitingFirstCard) {
    const ace = legal.find((c) => c.id === 'AS');
    return ace ? ace.id : legal[0].id;
  }

  // 2. Only one legal move available
  if (legal.length === 1) {
    return legal[0].id;
  }

  const hand = game.hands[seat];

  // 3. LEADING A FRESH TRICK
  if (game.trick.length === 0) {
    // If bot has only 1 card, lead it immediately
    if (hand.length === 1) return hand[0].id;

    // Group hand cards by suit
    const suitsMap = new Map();
    for (const c of hand) {
      if (!suitsMap.has(c.suit)) suitsMap.set(c.suit, []);
      suitsMap.get(c.suit).push(c);
    }

    // Check if any opponent is close to escaping (1 or 2 cards left)
    const vulnerableOpponents = [];
    for (let s = 0; s < game.playerCount; s++) {
      if (s !== seat && game.hands[s].length > 0 && game.hands[s].length <= 2) {
        vulnerableOpponents.push(s);
      }
    }

    // Score every legal card
    let bestCard = legal[0];
    let bestScore = -Infinity;

    for (const card of legal) {
      const suitCards = suitsMap.get(card.suit) || [];
      const suitLen = suitCards.length;
      const rankVal = RANK_VALUE[card.rank];
      const voidSeats = getSeatsVoidInSuit(game, card.suit, seat);
      const hasKnownVoid = voidSeats.length > 0;
      let score = 0;

      // 1) Critical: Do NOT let an opponent with 1-2 cards cut and escape!
      for (const opp of vulnerableOpponents) {
        if (game.knownVoids && game.knownVoids[opp] && game.knownVoids[opp].has(card.suit)) {
          score -= 600; // Major penalty: leading this suit allows them to escape!
        }
      }

      // 2) Danger of cut
      if (hasKnownVoid) {
        if (rankVal >= 11) {
          // A, K, Q: Fatal to lead if someone is void
          score -= 200 + rankVal * 15;
        } else if (rankVal <= 6) {
          // Low card (2-6): If an opponent between bot and the void player holds this suit,
          // they might be forced to play higher than our card and eat the penalty!
          score += 20;
        } else {
          score -= 80;
        }
      } else {
        // No known opponent is void in this suit -> safe to lead
        if (isBossCard(game, card)) {
          // Cashing a boss card (Ace / highest remaining): 100% safe way to discard high card!
          score += 90;
        } else if (suitLen === 1) {
          // Leading a singleton: voids this suit, unlocking cutting power for future tricks!
          score += 70;
        } else if (suitLen === 2 && card === suitCards[suitCards.length - 1]) {
          // Lower card of a doubleton: sets up a void next time
          score += 45;
        }
      }

      // 3) General tiebreakers:
      // Lower ranks are generally safer leads when not cashing boss cards
      if (!isBossCard(game, card)) {
        score -= rankVal * 2;
      }
      // Slightly favor suits with more cards when avoiding cuts
      if (!hasKnownVoid) {
        score += suitLen * 3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    return bestCard.id;
  }

  // 4. FOLLOWING SUIT
  const leadSuit = game.leadSuit;
  const hasLeadSuit = hand.some((c) => c.suit === leadSuit);

  if (hasLeadSuit) {
    const leadPlays = game.trick.filter((p) => p.card.suit === leadSuit);
    let maxLeadRankVal = -1;
    for (const p of leadPlays) {
      const val = RANK_VALUE[p.card.rank];
      if (val > maxLeadRankVal) maxLeadRankVal = val;
    }

    // Determine upcoming seats in this round
    const playedSeats = new Set(game.trick.map((p) => p.seat));
    const remainingSeats = (game.roundSeats || []).filter((s) => !playedSeats.has(s) && s !== seat);
    const isLastPlayer = remainingSeats.length === 0;
    const upcomingHasVoid = remainingSeats.some(
      (s) => game.knownVoids && game.knownVoids[s] && game.knownVoids[s].has(leadSuit)
    );

    // Cards below the current highest card (safe dumps)
    const cardsBelowMax = legal.filter((c) => RANK_VALUE[c.rank] < maxLeadRankVal);
    // Cards above the current highest card (winning candidates)
    const cardsAboveMax = legal.filter((c) => RANK_VALUE[c.rank] > maxLeadRankVal);

    // A) BOT IS THE LAST PLAYER:
    // No one can cut! The trick is guaranteed cut-free!
    if (isLastPlayer) {
      // If we hold high cards that can win (A, K, Q), WIN AND DISCARD THEM!
      // Winning when safe gets rid of dangerous high cards permanently into the discard pile!
      const highWinners = cardsAboveMax.filter((c) => RANK_VALUE[c.rank] >= 11);
      if (highWinners.length > 0) {
        // Play the highest card to discard it safely!
        highWinners.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
        return highWinners[0].id;
      }

      // If we have cards below max, dump the highest of them safely!
      if (cardsBelowMax.length > 0) {
        cardsBelowMax.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
        return cardsBelowMax[0].id;
      }

      // If we must win with a low/medium card, play lowest winner
      cardsAboveMax.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
      return cardsAboveMax[0].id;
    }

    // B) BOT IS NOT THE LAST PLAYER (Other players will play after):
    // If an upcoming player is known to be void, a cut IS coming!
    // We MUST duck below maxLeadRankVal if possible!
    if (cardsBelowMax.length > 0) {
      // Safe dump: discard the highest card that is below the current highest play!
      // The current highest player will eat the cut, not us!
      cardsBelowMax.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
      return cardsBelowMax[0].id;
    }

    // We have no cards below max: any card we play makes us the new highest!
    // Play our LOWEST card to minimize risk.
    const sortedLowToHigh = [...legal].sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
    return sortedLowToHigh[0].id;
  }

  // 5. VOID IN LEAD SUIT -> CUT (THULLA!)
  // Group legal off-suit cards by suit
  const suitsMap = new Map();
  for (const c of legal) {
    if (!suitsMap.has(c.suit)) suitsMap.set(c.suit, []);
    suitsMap.get(c.suit).push(c);
  }

  // Find who will receive the penalty
  let penaltySeat = null;
  let highestLeadRank = -1;
  for (const p of game.trick) {
    if (p.card.suit === leadSuit && game.hands[p.seat].length > 0) {
      const val = RANK_VALUE[p.card.rank];
      if (val > highestLeadRank) {
        highestLeadRank = val;
        penaltySeat = p.seat;
      }
    }
  }

  const penaltyPlayerNearEscape = penaltySeat !== null && game.hands[penaltySeat].length <= 3;

  let bestSuitCards = null;
  let bestCutScore = -Infinity;

  for (const [, cards] of suitsMap.entries()) {
    // Sort cards high rank to low rank
    cards.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    const rankSum = cards.reduce((sum, c) => sum + RANK_VALUE[c.rank], 0);
    let cutScore = 0;

    // Instant Win: If playing all cards of this suit empties our hand completely!
    if (cards.length === hand.length) {
      cutScore += 100000;
    }

    // Creating a Void: If playing all cards of this suit removes our last cards of this suit!
    const createsVoid = cards.length === (suitsMap.get(cards[0].suit)?.length || 0);
    if (createsVoid) {
      cutScore += 150;
    }

    // Volume of cards dumped (getting lighter):
    cutScore += cards.length * 50;

    // Rank value of cards dumped (shedding Aces, Kings, Queens into the penalty player):
    cutScore += rankSum * 4;

    // If the penalty player is near escape (1-3 cards), heavily prioritize dumping maximum cards on them!
    if (penaltyPlayerNearEscape) {
      cutScore += cards.length * 60;
    }

    if (cutScore > bestCutScore) {
      bestCutScore = cutScore;
      bestSuitCards = cards;
    }
  }

  if (bestSuitCards) {
    // If playing all cards empties our hand: play ALL of them!
    if (bestSuitCards.length === hand.length) {
      return bestSuitCards.map((c) => c.id);
    }
    // If we have 2, 3, or 4 cards of this suit, dump ALL of them to maximize penalty and create voids!
    if (bestSuitCards.length <= 4) {
      return bestSuitCards.length === 1 ? bestSuitCards[0].id : bestSuitCards.map((c) => c.id);
    }
    // If holding 5+ cards of this suit, dump the top 4 highest rank cards
    return bestSuitCards.slice(0, 4).map((c) => c.id);
  }

  return legal[0].id;
}

module.exports = { chooseBotMove, getSeatsVoidInSuit, isBossCard };
