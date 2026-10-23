import React, { useState } from 'react';
import { sounds } from '../sound.js';

export default function ResultScreen({
  view,
  t,
  busy,
  gadhaBraying,
  onPlayGadhaSound,
  onNewGame,
  onLeave,
  playerStats,
  onOpenStats,
}) {
  const { game, players, you } = view;
  const result = game.result;
  const iAmGadha = result.gadhaId === you.id;
  const finishOrder = result.finishOrder || [];
  const [localPlaying, setLocalPlaying] = useState(false);

  const isBraying = !!(gadhaBraying || localPlaying);

  function handlePlaySound() {
    if (onPlayGadhaSound) {
      onPlayGadhaSound();
    } else {
      sounds.gadha();
    }
    setLocalPlaying(true);
    setTimeout(() => setLocalPlaying(false), 3800);
  }

  // Sort players by exact finish order: #1 Winner, #2, ... up to the Gadha at the end
  const ranked = [...players].sort((a, b) => {
    if (a.id === result.gadhaId) return 1;
    if (b.id === result.gadhaId) return -1;
    const orderA = finishOrder.indexOf(a.seat);
    const orderB = finishOrder.indexOf(b.seat);
    if (orderA !== -1 && orderB !== -1) return orderA - orderB;
    if (orderA !== -1) return -1;
    if (orderB !== -1) return 1;
    return a.cardCount - b.cardCount || a.seat - b.seat;
  });

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className={`result-card ${iAmGadha ? 'is-me' : ''}`}>
        <button
          type="button"
          className={`donkey-mascot-btn ${isBraying ? 'is-playing' : ''}`}
          onClick={handlePlaySound}
          title={t('playGadhaSound')}
          aria-label={t('playGadhaSound')}
        >
          <span className="donkey-mascot" aria-hidden="true">
            🫏
          </span>
          <span className="sound-badge">
            {isBraying ? `🔊 🎵 ${t('brayingNow')}` : t('playGadhaSound')}
          </span>
        </button>

        {isBraying && (
          <div className="gadha-speech-bubble" role="status" aria-live="polite">
            <div className="speech-bubble-speaker">
              <span className="speech-live-dot"></span>
              <span>
                🗣️ <strong>{result.gadhaName}</strong> {iAmGadha ? `(${t('you')})` : ''} {t('isSaying')}:
              </span>
            </div>
            <div className="speech-bubble-quote">
              "{t('gadhaBrayText')}"
            </div>
            <div className="speech-soundwaves" aria-hidden="true">
              <span className="wave-bar b1"></span>
              <span className="wave-bar b2"></span>
              <span className="wave-bar b3"></span>
              <span className="wave-bar b4"></span>
              <span className="wave-bar b5"></span>
            </div>
          </div>
        )}

        <p className="muted center" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>
          {t('gameOver')}
        </p>

        <h2 id="result-title" className="result-header">
          {iAmGadha ? t('youAreGadha') : t('gadhaIs')}
        </h2>

        <div className={`gadha-title-name ${isBraying ? 'braying-active' : ''}`}>
          {iAmGadha ? 'ଗଧ · GADHA' : result.gadhaName}
          {isBraying && <span className="bray-live-indicator" aria-hidden="true">🗣️ 📢</span>}
        </div>

        <p className="muted center" style={{ fontSize: '13px', lineHeight: '1.4' }}>
          {t(`reason${result.reason}`)}
        </p>

        {/* Personal Gadha Record Callout */}
        <div className={`result-stat-banner ${iAmGadha ? 'is-gadha' : 'is-safe'}`}>
          <div className="result-stat-icon">{iAmGadha ? '🫏' : '👑'}</div>
          <div className="result-stat-content">
            <div className="result-stat-main">
              {iAmGadha
                ? t('youBecameGadhaCount', { count: playerStats?.gadhaCount || 1 })
                : t('youEscapedCount', { count: playerStats?.gadhaCount || 0 })}
            </div>
            <div className="result-stat-sub">
              {iAmGadha ? (
                <>
                  {view.roomStats?.scores?.[you.id]?.gadhaCount > 0 && (
                    <span>{t('roomGadhaCount', { n: view.roomStats.scores[you.id].gadhaCount })} · </span>
                  )}
                  <span>{t('gadhaRate')}: {playerStats?.totalGames > 0 ? Math.round(((playerStats.gadhaCount || 0) / playerStats.totalGames) * 100) : 0}%</span>
                </>
              ) : (
                <>
                  <span>🔥 {t('safeStreak')}: {playerStats?.currentSafeStreak || 0} {t('matches')}</span>
                  {view.roomStats?.scores?.[you.id]?.gadhaCount > 0 && (
                    <span> · {t('roomGadhaCount', { n: view.roomStats.scores[you.id].gadhaCount })}</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <ul className="podium-list">
          {ranked.map((p, idx) => {
            const isGadha = p.id === result.gadhaId;
            const isWinner = idx === 0 && !isGadha;
            const pRoomGadha = view.roomStats?.scores?.[p.id]?.gadhaCount || 0;
            return (
              <li
                key={p.id}
                className={`${isGadha ? 'gadha' : ''} ${isWinner ? 'winner' : ''} ${isGadha && isBraying ? 'is-braying-speaker' : ''}`}
              >
                <span>
                  {isGadha ? (isBraying ? '🗣️ 🫏 ' : '🫏 ') : isWinner ? '👑 #1 ' : `#${idx + 1} `}
                  {p.name}
                  {p.id === you.id ? ` (${t('you')})` : ''}
                  {pRoomGadha > 0 && (
                    <span className="podium-room-badge" title={`${t('timesGadha')}: ${pRoomGadha}`}>
                      🫏 {pRoomGadha}
                    </span>
                  )}
                </span>
                <span>
                  {isGadha ? (
                    <span className="gadha-badge-group">
                      <b style={{ color: '#ff9999' }}>GADHAA (ଗଧ)</b>
                      {isBraying && (
                        <span className="bray-badge-tag">
                          <span className="pulse-dot"></span>
                          {t('brayingNow')}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="badge-safe">✓ {t('safe')}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="stack" style={{ marginTop: '8px' }}>
          {you.isHost ? (
            <button type="button" className="btn btn-gold btn-big" onClick={onNewGame} disabled={busy}>
              🔄 {t('newGame')}
            </button>
          ) : (
            <p className="muted center" style={{ padding: '6px 0' }}>
              ⏳ {t('waitForHostNew')}
            </p>
          )}
          {onOpenStats && (
            <button type="button" className="btn btn-ghost" onClick={onOpenStats}>
              📊 {t('viewStats')}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onLeave} disabled={busy}>
            {t('leaveRoom')}
          </button>
        </div>
      </div>
    </div>
  );
}
