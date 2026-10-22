'use strict';
/**
 * Builds the JSON a particular player is allowed to see.
 *
 * PRIVACY: this is the only function that turns server state into network payloads.
 * Another player's hand is never read here - only its length. The viewer's own
 * hand is included once, under `game.hand`.
 */
const { MIN_PLAYERS } = require('./engine/cards');

const publicCard = (card) => ({ id: card.id, rank: card.rank, suit: card.suit });

function buildView(room, viewerId, maxPlayers) {
  const game = room.game;
  const viewerSeat = room.players.findIndex((p) => p.id === viewerId);
  const isSpectator = viewerSeat < 0;
  const spectator = isSpectator && room.spectators ? room.spectators.find((s) => s.id === viewerId) : null;
  const activeSpectators = room.spectators ? room.spectators.filter((s) => s.connected) : [];

  const view = {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    minPlayers: MIN_PLAYERS,
    maxPlayers: room.maxPlayers || maxPlayers,
    turnStartedAt: room.turnStartedAt || null,
    turnTimeoutMs: room.turnTimeoutMs || 20000,
    iceServers: room.iceServers || [],
    you: {
      id: viewerId,
      seat: viewerSeat,
      isHost: room.hostId === viewerId,
      isSpectator: !!spectator,
      name: spectator ? spectator.name : (room.players[viewerSeat]?.name || ''),
      avatar: spectator ? (spectator.avatar || '👀') : (room.players[viewerSeat]?.avatar || '🫏'),
      voice: (spectator ? spectator.voice : room.players[viewerSeat]?.voice) || { active: false, muted: false },
    },
    spectatorCount: activeSpectators.length,
    spectators: activeSpectators.map((s) => ({
      id: s.id,
      name: s.name,
      avatar: s.avatar || '👀',
      voice: s.voice || { active: false, muted: false },
    })),
    players: room.players.map((p, seat) => ({
      id: p.id,
      seat,
      name: p.name,
      avatar: p.avatar || '🫏',
      isHost: p.id === room.hostId,
      connected: p.connected,
      left: p.left,
      voice: p.voice || { active: false, muted: false },
      cardCount: game ? game.hands[seat].length : 0,
      pileCount: game ? game.piles[seat].length : 0,
    })),
    game: null,
  };

  if (game) {
    const resolving = game.phase === 'resolving';
    view.game = {
      round: game.round,
      turnSeat: game.phase === 'playing' ? game.turnSeat : null,
      turnStartedAt: room.turnStartedAt || null,
      turnTimeoutMs: room.turnTimeoutMs || 20000,
      leadSuit: game.leadSuit,
      awaitingAce: game.awaitingFirstCard,
      trick: game.trick.map((p) => ({ seat: p.seat, card: publicCard(p.card) })),
      resolving,
      pendingWinnerSeat: resolving ? game.pendingWinner() : null,
      pendingCutterSeat: resolving && game.lastTrick?.isCut ? game.lastTrick.cutterSeat : null,
      pendingPenaltySeat: resolving && game.lastTrick?.isCut ? game.lastTrick.penaltySeat : null,
      isCut: resolving ? !!game.lastTrick?.isCut : false,
      lastTrick: game.lastTrick
        ? {
            seq: game.lastTrick.seq,
            winnerSeat: game.lastTrick.winnerSeat,
            isCut: !!game.lastTrick.isCut,
            cutterSeat: game.lastTrick.cutterSeat,
            penaltySeat: game.lastTrick.penaltySeat,
            plays: game.lastTrick.plays.map((p) => ({ seat: p.seat, card: publicCard(p.card) })),
          }
        : null,
      hand: viewerSeat >= 0 ? game.hands[viewerSeat].map(publicCard) : [],
      legal: viewerSeat >= 0 ? game.legalCards(viewerSeat).map((c) => c.id) : [],
      result: game.result
        ? {
            gadhaSeat: game.result.gadhaSeat,
            gadhaId: room.players[game.result.gadhaSeat].id,
            gadhaName: room.players[game.result.gadhaSeat].name,
            reason: game.result.reason,
            finishOrder: game.result.finishOrder,
          }
        : null,
    };
  }
  return view;
}

module.exports = { buildView };
