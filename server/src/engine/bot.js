'use strict';
const { RANK_VALUE } = require('./cards');

/**
 * Intelligent decision-making for computer (bot) players in Gadhaa.
 *
 * Rules:
 *  - Must follow suit if holding leadSuit.
 *  - If void in leadSuit, can cut (Thulla) with 1 or multiple cards of the same suit.
 *  - Starter must play A♠.
 *  - Winner of trick (or recipient of cut) leads next trick.
 *  - Goal is to empty hand and avoid being left with cards (Gadha).
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

  // 3. Leading a fresh trick
  if (game.trick.length === 0) {
    // When leading, high cards of short suits are risky because opponents may cut them.
    // Count suit frequencies in hand:
    const suitCounts = {};
    for (const c of hand) {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    }

    // Sort legal cards:
    // Prioritize longer suits (so opponents are less likely to cut),
    // and lower ranks (so the bot is less likely to be the highest lead card if cut).
    const sorted = [...legal].sort((a, b) => {
      const countDiff = (suitCounts[b.suit] || 0) - (suitCounts[a.suit] || 0);
      if (countDiff !== 0) return countDiff;
      return RANK_VALUE[a.rank] - RANK_VALUE[b.rank]; // lowest rank first
    });

    return sorted[0].id;
  }

  // 4. Must follow suit
  const leadSuit = game.leadSuit;
  const hasLeadSuit = hand.some((c) => c.suit === leadSuit);

  if (hasLeadSuit) {
    // All cards in `legal` have suit === leadSuit
    const leadPlays = game.trick.filter((p) => p.card.suit === leadSuit);
    let maxLeadRankVal = -1;
    for (const p of leadPlays) {
      const val = RANK_VALUE[p.card.rank];
      if (val > maxLeadRankVal) maxLeadRankVal = val;
    }

    // If another player already played higher than some of our cards,
    // we can safely dump our highest card below that max without taking the trick!
    const cardsBelowMax = legal.filter((c) => RANK_VALUE[c.rank] < maxLeadRankVal);
    if (cardsBelowMax.length > 0) {
      // Sort highest to lowest to dump our highest safe card
      cardsBelowMax.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
      return cardsBelowMax[0].id;
    }

    // If all our cards are higher than the current max (meaning we will take the lead),
    // play the LOWEST of them to minimize how high our card is.
    const sortedLowToHigh = [...legal].sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
    return sortedLowToHigh[0].id;
  }

  // 5. Void in lead suit -> CUT!
  // Group legal cards by suit
  const suitsMap = new Map();
  for (const c of legal) {
    if (!suitsMap.has(c.suit)) suitsMap.set(c.suit, []);
    suitsMap.get(c.suit).push(c);
  }

  // We can multi-cut with cards of the same suit!
  // Find the suit with the best cards to dump (high rank cards and/or multiple cards)
  let bestSuitGroup = null;
  let bestScore = -1;

  for (const [, cards] of suitsMap.entries()) {
    // Sort cards high rank to low rank
    cards.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    const rankSum = cards.reduce((sum, c) => sum + RANK_VALUE[c.rank], 0);
    // Extra weight for multi-cards to dump faster
    const score = cards.length * 25 + rankSum;
    if (score > bestScore) {
      bestScore = score;
      bestSuitGroup = cards;
    }
  }

  if (bestSuitGroup && bestSuitGroup.length > 1) {
    // Play multiple cards of the same suit to cut! (e.g. dump up to 3 cards or all of them)
    const cardsToCut = bestSuitGroup.slice(0, 3);
    return cardsToCut.map((c) => c.id);
  }

  if (bestSuitGroup && bestSuitGroup.length === 1) {
    return bestSuitGroup[0].id;
  }

  return legal[0].id;
}

module.exports = { chooseBotMove };

