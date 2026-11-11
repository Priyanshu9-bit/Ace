'use strict';
const { RANKS, RANK_VALUE } = require('./cards');

/**
 * Returns which active opponents are known to be void in a suit.
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
 * Returns all card IDs of the same suit that are higher in rank than `card`
 * and have NOT been seen yet (neither in discard, current trick, nor my own hand).
 * If this set is empty, `card` is the absolute UNCONTESTED BOSS of its suit!
 */
function getUnseenHigherCards(game, card, mySeat) {
  const higherRanks = RANKS.slice(0, RANKS.indexOf(card.rank));
  const higherCardIds = new Set(higherRanks.map((r) => `${r}${card.suit}`));

  // Exclude cards in bot's hand
  if (game.hands && game.hands[mySeat]) {
    for (const c of game.hands[mySeat]) higherCardIds.delete(c.id);
  }
  // Exclude cards already discarded to the dead pile
  if (game.discarded) {
    for (const c of game.discarded) higherCardIds.delete(c.id);
  }
  // Exclude cards on the table in the current trick
  if (game.trick) {
    for (const p of game.trick) higherCardIds.delete(p.card.id);
  }

  return higherCardIds;
}

/**
 * Checks if a card is currently the highest remaining card of its suit in the game.
 */
function isBossCard(game, card, mySeat) {
  return getUnseenHigherCards(game, card, mySeat).size === 0;
}

/**
 * Tournament Grandmaster decision-making engine for computer (bot) players in Gadhaa.
 *
 * Employs deep competitive game theory:
 *  1. Omniscient Card-Counting: Subtracts dead/held cards to know exact boss cards in real-time.
 *  2. Hand Tracking: Monitors specific cards picked up by opponents on penalties.
 *  3. Threat Neutralization: Identifies opponents near escape (1-2 cards) and starves their void suits.
 *  4. Singleton Void-Busting: Leads safe singletons to build permanent cutting weapons.
 *  5. Last-Seat Clean Discards: Identifies guaranteed cut-free positions to safely dump Aces/Kings.
 *  6. Strategic Ducking & Trap Play: Manipulates trick dynamics so opponents eat penalty cuts.
 *  7. Multi-Card Finisher: Executes maximum-card cuts to empty hand or overload vulnerable rivals.
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
    // If bot has only 1 card left, lead it to escape!
    if (hand.length === 1) return hand[0].id;

    // Group hand cards by suit
    const suitsMap = new Map();
    for (const c of hand) {
      if (!suitsMap.has(c.suit)) suitsMap.set(c.suit, []);
      suitsMap.get(c.suit).push(c);
    }

    // Check if all cards in hand are of the exact same suit
    if (suitsMap.size === 1) {
      // Pick the lowest card to minimize penalty risk if cut
      const allCards = [...legal].sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
      return allCards[0].id;
    }

    // Identify active opponents dangerously close to escaping (1 or 2 cards left)
    const opponentsNearEscape = [];
    for (let s = 0; s < game.playerCount; s++) {
      if (s !== seat && game.hands[s].length > 0 && game.hands[s].length <= 2) {
        opponentsNearEscape.push(s);
      }
    }

    let bestCard = legal[0];
    let bestScore = -Infinity;

    for (const card of legal) {
      const suitCards = suitsMap.get(card.suit) || [];
      const suitLen = suitCards.length;
      const rankVal = RANK_VALUE[card.rank];
      const voidSeats = getSeatsVoidInSuit(game, card.suit, seat);
      const hasKnownVoid = voidSeats.length > 0;
      const isBoss = isBossCard(game, card, seat);
      let score = 0;

      // Rule A: THREAT DEFENSE - Do NOT let an opponent with 1-2 cards cut and escape!
      for (const opp of opponentsNearEscape) {
        if (game.knownVoids && game.knownVoids[opp] && game.knownVoids[opp].has(card.suit)) {
          score -= 1000; // Extreme penalty: leading this suit gives them an instant escape!
        }
        // If we know an opponent near escape holds a specific card of this suit,
        // leading a HIGHER card forces them to follow suit and keeps them in the game!
        if (game.knownPickedUpCards && game.knownPickedUpCards[opp]) {
          for (const cardId of game.knownPickedUpCards[opp]) {
            if (cardId.endsWith(card.suit)) {
              const oppCardRank = RANK_VALUE[cardId.slice(0, -1)];
              if (rankVal > oppCardRank && isBoss) {
                score += 250; // Trap lead: forces endangered opponent to follow suit with their card!
              }
            }
          }
        }
      }

      // Rule B: DANGER OF BEING CUT
      if (hasKnownVoid) {
        if (rankVal >= 10) {
          // A, K, Q, J: Suicide to lead when someone is known to be void!
          score -= 300 + rankVal * 20;
        } else if (rankVal <= 6) {
          // Trap Lead: If an opponent between bot and the void player holds this suit,
          // they might be forced to follow with a high card and eat the penalty!
          score += 35;
        } else {
          score -= 100;
        }
      } else {
        // No opponent is known to be void in this suit -> relatively safe
        if (isBoss) {
          // Cash Boss Card (Ace or highest remaining): 100% guaranteed safe trick win!
          score += 150;
        } else if (suitLen === 1) {
          // Void Creation: Shedding a singleton permanently unlocks cutting power!
          score += 120;
        } else if (suitLen === 2 && card === suitCards[suitCards.length - 1]) {
          // Lower card of a doubleton: works towards establishing a void
          score += 50;
        }
      }

      // Rule C: RANK AND SUIT HEURISTICS
      if (!isBoss) {
        score -= rankVal * 3; // Prefer low leads unless it is the boss
      }
      if (!hasKnownVoid) {
        score += suitLen * 4; // Longer suits are safer against surprise cuts
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

    // Determine remaining active seats in this trick
    const playedSeats = new Set(game.trick.map((p) => p.seat));
    const remainingSeats = (game.roundSeats || []).filter((s) => !playedSeats.has(s) && s !== seat);
    const isLastPlayer = remainingSeats.length === 0;

    const cardsBelowMax = legal.filter((c) => RANK_VALUE[c.rank] < maxLeadRankVal);
    const cardsAboveMax = legal.filter((c) => RANK_VALUE[c.rank] > maxLeadRankVal);

    // A) BOT IS THE LAST PLAYER:
    // No one can cut! The trick is 100% cut-free!
    if (isLastPlayer) {
      // If we have high cards that win (A, K, Q, J, 10), win and discard them permanently!
      const highWinners = cardsAboveMax.filter((c) => RANK_VALUE[c.rank] >= 10);
      if (highWinners.length > 0) {
        highWinners.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
        return highWinners[0].id; // Play highest winner to clear big liability
      }

      // If we have cards below max, dump the HIGHEST of them safely!
      if (cardsBelowMax.length > 0) {
        cardsBelowMax.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
        return cardsBelowMax[0].id;
      }

      // If we must win with a low card, play lowest winner
      cardsAboveMax.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
      return cardsAboveMax[0].id;
    }

    // B) BOT IS NOT THE LAST PLAYER (Other players will play after):
    // Prioritize safe ducking: play the HIGHEST card that is below the current highest!
    if (cardsBelowMax.length > 0) {
      cardsBelowMax.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
      return cardsBelowMax[0].id;
    }

    // We have no cards below max (forced to take lead):
    // Play our LOWEST card to give upcoming players a chance to play higher!
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
    cards.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    const rankSum = cards.reduce((sum, c) => sum + RANK_VALUE[c.rank], 0);
    let cutScore = 0;

    // 1) Instant Win: If playing all cards of this suit empties our hand completely!
    if (cards.length === hand.length) {
      cutScore += 1000000;
    }

    // 2) Void Creation: If playing all cards of this suit removes all cards of this suit!
    const createsVoid = cards.length === (suitsMap.get(cards[0].suit)?.length || 0);
    if (createsVoid) {
      cutScore += 250;
    }

    // 3) Volume of cards dumped (getting lighter):
    cutScore += cards.length * 60;

    // 4) Rank value of cards dumped (shedding heavy Aces/Kings onto rival):
    cutScore += rankSum * 5;

    // 5) If penalty player is near escape, heavily prioritize maximum card overload:
    if (penaltyPlayerNearEscape) {
      cutScore += cards.length * 90;
    }

    if (cutScore > bestCutScore) {
      bestCutScore = cutScore;
      bestSuitCards = cards;
    }
  }

  if (bestSuitCards) {
    // If playing all cards empties our hand: play ALL of them for instant victory!
    if (bestSuitCards.length === hand.length) {
      return bestSuitCards.map((c) => c.id);
    }
    // Dump all cards of this suit (or up to 4 if holding a huge suit)
    if (bestSuitCards.length <= 4) {
      return bestSuitCards.length === 1 ? bestSuitCards[0].id : bestSuitCards.map((c) => c.id);
    }
    return bestSuitCards.slice(0, 4).map((c) => c.id);
  }

  return legal[0].id;
}

module.exports = { chooseBotMove, getSeatsVoidInSuit, isBossCard, getUnseenHigherCards };
