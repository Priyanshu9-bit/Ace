'use strict';
/**
 * ============================================================================
 *  GADHA ENDING RULES — the ambiguous part of the game lives here, on purpose.
 * ============================================================================
 *
 *  Collected cards go to a pile and never return to hands, so hands only shrink and
 *  "who is the Gadha?" is not fully determined by the rules as written. Change the two
 *  functions below to change how the game ends. They only need a `game` that exposes:
 *    game.seatsWithCards()  -> array of seat numbers that still hold cards
 *    game.lastTrickWinner   -> seat that won the most recent round
 */

/** Check if any two active players have at least one suit in common */
function hasAnySharedSuit(game) {
  if (!game.hands || !Array.isArray(game.hands)) return true;
  const activeSeats = game.seatsWithCards();
  if (activeSeats.length < 2) return false;
  const firstHand = game.hands[activeSeats[0]];
  if (!firstHand || !Array.isArray(firstHand) || typeof firstHand[0] !== 'object') return true;
  for (let i = 0; i < activeSeats.length; i++) {
    const suitsA = new Set(game.hands[activeSeats[i]].map((c) => c.suit));
    for (let j = i + 1; j < activeSeats.length; j++) {
      for (const c of game.hands[activeSeats[j]]) {
        if (suitsA.has(c.suit)) return true;
      }
    }
  }
  return false;
}

/** The game is over as soon as fewer than two players still hold cards, or no common suits remain. */
function isGameOver(game) {
  return game.seatsWithCards().length < 2 || !hasAnySharedSuit(game);
}

/**
 * Who is the Gadha once the game is over?
 *  1. Exactly one player still holds cards -> that player (LAST_HOLDER).
 *  2. If multiple players hold cards but have no suits in common -> the player holding the most cards.
 *  3. Everyone ran out in the same round -> whoever received the last penalty / last round winner.
 */
function determineGadha(game) {
  const holders = game.seatsWithCards();
  if (holders.length === 1) return { seat: holders[0], reason: 'LAST_HOLDER' };
  if (holders.length > 1) {
    let maxSeat = holders[0];
    for (const s of holders) {
      if (game.hands[s].length > game.hands[maxSeat].length) maxSeat = s;
    }
    return { seat: maxSeat, reason: 'LAST_HOLDER' };
  }
  if (game.lastTrick && game.lastTrick.penaltySeat !== null && game.lastTrick.penaltySeat !== undefined) {
    return { seat: game.lastTrick.penaltySeat, reason: 'LAST_PENALTY' };
  }
  return { seat: game.lastTrickWinner ?? 0, reason: 'LAST_TRICK_WINNER' };
}

module.exports = { isGameOver, determineGadha, hasAnySharedSuit };
