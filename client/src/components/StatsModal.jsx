import React, { useState } from 'react';
import { getPlayerRank } from '../stats.js';

export default function StatsModal({
  stats,
  view,
  playerName,
  playerAvatar,
  t,
  onClose,
  onResetStats,
}) {
  const [confirmReset, setConfirmReset] = useState(false);

  const rank = getPlayerRank(stats, t);
  const total = stats.totalGames || 0;
  const gadhaCount = stats.gadhaCount || 0;
  const escapedCount = stats.escapedCount || 0;
  const gadhaRate = total > 0 ? Math.round((gadhaCount / total) * 100) : 0;
  const safeRate = 100 - gadhaRate;

  // Room session stats
  const inRoom = !!(view && view.code);
  const roomGames = view?.roomStats?.gamesPlayed || 0;
  const roomScores = view?.roomStats?.scores || {};
  const myRoomGadha = view?.you?.id ? (roomScores[view.you.id]?.gadhaCount || 0) : 0;

  function handleReset() {
    onResetStats();
    setConfirmReset(false);
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="stats-modal-title">
      <div className="stats-modal">
        {/* Modal Header */}
        <div className="stats-modal-header">
          <div className="stats-title-group">
            <span className="stats-icon-badge" aria-hidden="true">📊</span>
            <div>
              <h2 id="stats-modal-title" className="stats-modal-title">
                {t('statsTitle')}
              </h2>
              <p className="stats-modal-subtitle">
                {t('statsSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="stats-close-btn"
            onClick={onClose}
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>

        {/* Player Profile Banner */}
        <div className="stats-profile-card">
          <div className="stats-profile-avatar" aria-hidden="true">
            {playerAvatar || '🫏'}
          </div>
          <div className="stats-profile-info">
            <span className="stats-profile-name">{playerName || t('you')}</span>
            <div className="stats-rank-tag" style={{ borderColor: rank.color, color: rank.color }}>
              <span>{rank.icon}</span>
              <span>{rank.title}</span>
            </div>
          </div>
        </div>

        {/* Primary Stats Grid */}
        <div className="stats-grid">
          {/* Times Became Gadha (Losses) - Featured Hero Card */}
          <div className="stats-card stat-gadha-card">
            <div className="stat-card-top">
              <span className="stat-label">🫏 {t('timesGadha')}</span>
              <span className="stat-badge-loss">{t('losses')}</span>
            </div>
            <div className="stat-giant-num stat-num-gadha">{gadhaCount}</div>
            <p className="stat-footnote">
              {gadhaCount === 0
                ? t('neverGadhaHint')
                : t('gadhaCountDesc', { n: gadhaCount })}
            </p>
          </div>

          {/* Times Escaped Safe (Wins) */}
          <div className="stats-card stat-safe-card">
            <div className="stat-card-top">
              <span className="stat-label">👑 {t('timesSafe')}</span>
              <span className="stat-badge-safe">{t('escapes')}</span>
            </div>
            <div className="stat-giant-num stat-num-safe">{escapedCount}</div>
            <p className="stat-footnote">
              {stats.firstWinCount > 0
                ? t('firstWinsCount', { n: stats.firstWinCount })
                : t('safeEscapeDesc')}
            </p>
          </div>

          {/* Total Matches */}
          <div className="stats-card">
            <div className="stat-card-top">
              <span className="stat-label">🎮 {t('gamesPlayed')}</span>
            </div>
            <div className="stat-giant-num">{total}</div>
            <p className="stat-footnote">{t('totalFinishedMatches')}</p>
          </div>

          {/* Gadha Rate */}
          <div className="stats-card">
            <div className="stat-card-top">
              <span className="stat-label">📉 {t('gadhaRate')}</span>
              <span className="stat-rate-text">{gadhaRate}%</span>
            </div>
            <div className="stats-progress-bar" title={`${safeRate}% Safe / ${gadhaRate}% Gadhaa`}>
              <div className="progress-safe" style={{ width: `${safeRate}%` }}></div>
              <div className="progress-gadha" style={{ width: `${gadhaRate}%` }}></div>
            </div>
            <div className="progress-legend">
              <span className="legend-item"><span className="legend-dot safe"></span> {t('safe')}: {safeRate}%</span>
              <span className="legend-item"><span className="legend-dot gadha"></span> {t('gadha')}: {gadhaRate}%</span>
            </div>
          </div>
        </div>

        {/* Streaks Row */}
        <div className="stats-streaks-row">
          <div className="streak-box">
            <span className="streak-icon">🔥</span>
            <div>
              <div className="streak-title">{t('safeStreak')}</div>
              <div className="streak-val">{stats.currentSafeStreak || 0} {t('matches')}</div>
            </div>
          </div>
          <div className="streak-box">
            <span className="streak-icon">⚡</span>
            <div>
              <div className="streak-title">{t('bestStreak')}</div>
              <div className="streak-val">{stats.bestSafeStreak || 0} {t('matches')}</div>
            </div>
          </div>
        </div>

        {/* Current Room Session Scoreboard (if inside a room) */}
        {inRoom && (
          <div className="stats-room-section">
            <div className="stats-section-header">
              <span className="stats-section-title">
                🏠 {t('currentRoomStats')} ({t('roomCode')}: <b style={{ color: 'var(--gold)' }}>{view.code}</b>)
              </span>
              <span className="field-badge">{roomGames} {t('matches')}</span>
            </div>

            <div className="room-scoreboard-table">
              {view.players.map((p) => {
                const pRoomGadha = roomScores[p.id]?.gadhaCount || 0;
                const pRoomWins = roomScores[p.id]?.winCount || 0;
                const isYou = p.id === view.you?.id;
                return (
                  <div key={p.id} className={`room-score-row ${isYou ? 'is-me' : ''}`}>
                    <div className="room-score-player">
                      <span className="player-avatar-mini">{p.avatar || '🫏'}</span>
                      <span className="room-score-name">
                        {p.name} {isYou ? `(${t('you')})` : ''}
                      </span>
                    </div>
                    <div className="room-score-counts">
                      <span className={`gadha-count-badge ${pRoomGadha > 0 ? 'has-gadha' : ''}`} title={t('timesGadha')}>
                        🫏 {pRoomGadha}
                      </span>
                      <span className="safe-count-badge" title={t('timesSafe')}>
                        ✓ {pRoomWins}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Match History Log */}
        <div className="stats-history-section">
          <div className="stats-section-header">
            <span className="stats-section-title">📜 {t('recentMatches')}</span>
          </div>

          {stats.history && stats.history.length > 0 ? (
            <div className="stats-history-list">
              {stats.history.slice(0, 15).map((h) => {
                const isGadha = h.outcome === 'gadha';
                const isFirst = h.outcome === 'first';
                return (
                  <div key={h.id} className={`history-item ${isGadha ? 'item-gadha' : isFirst ? 'item-first' : 'item-safe'}`}>
                    <div className="history-badge">
                      {isGadha ? (
                        <span className="badge-gadha-loss">🫏 {t('becameGadha')}</span>
                      ) : isFirst ? (
                        <span className="badge-first-win">👑 {t('firstOut')}</span>
                      ) : (
                        <span className="badge-safe-win">✓ {t('escapedSafe')}</span>
                      )}
                    </div>
                    <div className="history-details">
                      <div className="history-meta">
                        <span>{formatDate(h.timestamp)}</span>
                        <span>·</span>
                        <span>{t('roomCode')}: {h.roomCode}</span>
                        {h.playerCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{h.playerCount} {t('players')}</span>
                          </>
                        )}
                      </div>
                      <div className="history-reason">
                        {isGadha
                          ? t(`reason${h.reason}`)
                          : `${t('gadhaWas')}: ${h.gadhaName}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="stats-empty-history">
              <span>🂠</span>
              <p>{t('noMatchesYet')}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="stats-modal-footer">
          {confirmReset ? (
            <div className="reset-confirm-box">
              <p>{t('resetConfirm')}</p>
              <div className="row" style={{ gap: '8px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-small"
                  style={{ background: '#a83226', color: '#fff', borderColor: '#ff4d4d' }}
                  onClick={handleReset}
                >
                  ⚠️ {t('yesReset')}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => setConfirmReset(false)}
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-small reset-trigger-btn"
              onClick={() => setConfirmReset(true)}
            >
              🗑️ {t('resetStats')}
            </button>
          )}

          <button type="button" className="btn btn-gold btn-big" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
