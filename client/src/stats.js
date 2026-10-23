// Manages lifetime and session game stats for the player.
// Tracks how many times the player became the Gadhaa (lost), escaped safe (won),
// safe streaks, game history, and rank badge.

const STATS_KEY = 'gadha.player_stats';

export const DEFAULT_STATS = {
  totalGames: 0,
  gadhaCount: 0,        // Total times player lost (became Gadha)
  escapedCount: 0,      // Total times player escaped safe
  firstWinCount: 0,     // Total times player finished #1 (first out)
  currentSafeStreak: 0, // Consecutive matches without becoming Gadha
  bestSafeStreak: 0,    // Longest streak without becoming Gadha
  lastPlayedAt: null,
  lastSignature: null,
  history: [],          // Recent matches log
};

export function loadPlayerStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    return {
      totalGames: Number(parsed.totalGames) || 0,
      gadhaCount: Number(parsed.gadhaCount) || 0,
      escapedCount: Number(parsed.escapedCount) || 0,
      firstWinCount: Number(parsed.firstWinCount) || 0,
      currentSafeStreak: Number(parsed.currentSafeStreak) || 0,
      bestSafeStreak: Number(parsed.bestSafeStreak) || 0,
      lastPlayedAt: parsed.lastPlayedAt || null,
      lastSignature: parsed.lastSignature || null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function savePlayerStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* ignore storage quota errors */
  }
}

export function clearPlayerStats() {
  const fresh = { ...DEFAULT_STATS, history: [] };
  savePlayerStats(fresh);
  return fresh;
}

/**
 * Record a completed match into lifetime statistics.
 * Uses a unique signature to guarantee idempotence (prevents double-counting).
 */
export function recordGameResult(roomCode, viewerId, result, players, mySeat) {
  if (!result) return loadPlayerStats();

  const stats = loadPlayerStats();
  const signature = `${roomCode || 'GAME'}_${result.gadhaId || result.gadhaSeat}_${result.finishOrder ? result.finishOrder.join('-') : ''}_${result.reason || ''}`;

  if (stats.lastSignature === signature) {
    return stats; // Already recorded this game
  }

  const isGadha = result.gadhaId === viewerId || (result.gadhaSeat !== undefined && result.gadhaSeat === mySeat);
  const finishOrder = result.finishOrder || [];
  const myRank = finishOrder.indexOf(mySeat);
  const isFirstOut = myRank === 0 && !isGadha;

  stats.totalGames += 1;
  stats.lastPlayedAt = Date.now();
  stats.lastSignature = signature;

  if (isGadha) {
    stats.gadhaCount += 1;
    stats.currentSafeStreak = 0;
  } else {
    stats.escapedCount += 1;
    stats.currentSafeStreak += 1;
    if (stats.currentSafeStreak > stats.bestSafeStreak) {
      stats.bestSafeStreak = stats.currentSafeStreak;
    }
    if (isFirstOut) {
      stats.firstWinCount += 1;
    }
  }

  const historyItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    roomCode: roomCode || '—',
    outcome: isGadha ? 'gadha' : isFirstOut ? 'first' : 'safe',
    isGadha,
    gadhaName: result.gadhaName || '—',
    reason: result.reason || 'LAST_HOLDER',
    playerCount: players ? players.length : 0,
  };

  stats.history = [historyItem, ...(stats.history || [])].slice(0, 30);
  savePlayerStats(stats);
  return stats;
}

/**
 * Calculates rank title, badge icon, and color based on play history.
 */
export function getPlayerRank(stats, t) {
  const { totalGames, gadhaCount } = stats;
  if (!totalGames || totalGames === 0) {
    return {
      title: t('rankNewbie'),
      icon: '🌱',
      badgeClass: 'rank-newbie',
      color: '#95b8a5',
    };
  }

  const gadhaRate = Math.round((gadhaCount / totalGames) * 100);

  if (gadhaCount === 0) {
    return {
      title: t('rankAce'),
      icon: '👑',
      badgeClass: 'rank-ace',
      color: 'var(--gold)',
    };
  }
  if (gadhaRate <= 20) {
    return {
      title: t('rankMaster'),
      icon: '⚡',
      badgeClass: 'rank-master',
      color: '#4facfe',
    };
  }
  if (gadhaRate <= 40) {
    return {
      title: t('rankPlayer'),
      icon: '🎴',
      badgeClass: 'rank-player',
      color: '#2ecc71',
    };
  }
  if (gadhaRate <= 60) {
    return {
      title: t('rankStruggling'),
      icon: '⚠️',
      badgeClass: 'rank-danger',
      color: '#f39c12',
    };
  }
  return {
    title: t('rankDonkeyKing'),
    icon: '🫏',
    badgeClass: 'rank-gadha',
    color: '#ff6b6b',
  };
}
