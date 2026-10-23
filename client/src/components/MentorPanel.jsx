import React, { useLayoutEffect, useRef, useState } from 'react';
import PlayingCard from './PlayingCard.jsx';

function useElementWidth(ref) {
  const [width, setWidth] = useState(360);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setWidth(el.clientWidth || 360);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export default function MentorPanel({
  guiding,
  outgoingRequest,
  playingPlayers,
  onRequestGuide,
  onCancelRequest,
  onStopGuiding,
  onWhisperTo,
  voiceActive = false,
  t,
}) {
  const deckRef = useRef(null);
  const width = useElementWidth(deckRef);

  // If currently guiding a player, display their cards!
  if (guiding) {
    const { targetName, targetAvatar, targetId, hand = [], legal = [] } = guiding;
    const legalSet = new Set(legal);
    const n = hand.length;
    const cardW = width < 480 ? 54 : width < 800 ? 68 : 80;
    const cardH = Math.round(cardW * 1.4);
    const step = n > 1 ? Math.min(cardW * 0.88, (width - cardW - 16) / (n - 1)) : 0;
    const total = cardW + step * Math.max(0, n - 1);
    const offset = Math.max(8, (width - total) / 2);

    return (
      <section className="mentor-panel mentor-guiding-active" aria-label={t('guidingPlayer', { name: targetName })}>
        <div className="mentor-header-bar">
          <div className="mentor-header-title">
            <span className="mentor-header-avatar">{targetAvatar || '🫏'}</span>
            <div className="mentor-header-details">
              <span className="mentor-status-label">
                👀 {t('guidingPlayer', { name: targetName })}
              </span>
              <span className="mentor-cards-count">
                <b>{n}</b> {t('cards')} remaining
              </span>
            </div>
          </div>

          <div className="mentor-header-actions">
            {voiceActive && (
              <button
                type="button"
                className="btn btn-small btn-whisper"
                onClick={() => onWhisperTo(targetId)}
                title={t('whisperTarget', { name: targetName })}
              >
                🎙️ {t('whisperTarget', { name: targetName })}
              </button>
            )}
            <button
              type="button"
              className="btn btn-small btn-stop-guide"
              onClick={onStopGuiding}
              title={t('stopGuiding')}
            >
              ✕ {t('stopGuiding')}
            </button>
          </div>
        </div>

        <div className="mentor-advice-hint">
          <span>💡</span>
          <span>{t('guideAdviceHint')}</span>
        </div>

        <div
          className="hand-deck-area mentor-deck-area"
          ref={deckRef}
          style={{ height: cardH + 28, '--card-w': `${cardW}px` }}
        >
          {hand.map((card, i) => {
            const isLegal = legalSet.has(card.id);
            const arcFrac = n > 1 ? i / (n - 1) - 0.5 : 0;
            const rotDeg = Math.round(arcFrac * 12);
            const arcY = Math.round(Math.abs(arcFrac) * 6);

            return (
              <PlayingCard
                key={card.id}
                card={card}
                playable={isLegal}
                dimmed={!isLegal}
                highlight={isLegal}
                style={{
                  left: offset + i * step,
                  transform: `rotate(${rotDeg}deg) translateY(${arcY}px)`,
                  zIndex: isLegal ? 50 + i : 10 + i,
                }}
                className={`in-hand mentor-view-card ${isLegal ? 'is-mentor-legal' : ''}`}
              />
            );
          })}
        </div>
      </section>
    );
  }

  // If a guide request was sent and is awaiting acceptance
  if (outgoingRequest) {
    return (
      <section className="mentor-panel mentor-waiting" aria-live="polite">
        <div className="mentor-waiting-content">
          <div className="mentor-pulse-icon">⏳</div>
          <div className="mentor-waiting-details">
            <span className="mentor-waiting-title">
              {t('waitingGuideAccept', { name: outgoingRequest.targetName })}
            </span>
            <p className="mentor-waiting-sub">
              They will receive a notification to share their hand with you.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={onCancelRequest}
          >
            ✕ {t('cancelRequest')}
          </button>
        </div>
      </section>
    );
  }

  // Default safe player mentor lounge: choose a playing player to guide
  return (
    <section className="mentor-panel mentor-lounge" aria-label={t('safeMentorTitle')}>
      <div className="mentor-lounge-header">
        <div className="mentor-lounge-badge">
          <span>👑</span>
          <span>{t('safeMentorTitle')}</span>
        </div>
        <p className="mentor-lounge-desc">{t('safeMentorDesc')}</p>
      </div>

      <div className="mentor-targets-grid">
        {playingPlayers.length === 0 ? (
          <p className="muted" style={{ margin: '8px auto', fontSize: '13px' }}>
            No other active players holding cards.
          </p>
        ) : (
          playingPlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              className="mentor-target-card"
              onClick={() => onRequestGuide(player.id)}
            >
              <div className="mentor-target-avatar">{player.avatar || '🫏'}</div>
              <div className="mentor-target-meta">
                <span className="mentor-target-name">{player.name}</span>
                <span className="mentor-target-count">🂠 {player.cardCount} {t('cards')}</span>
              </div>
              <span className="mentor-target-action-btn">
                👁️ {t('requestToGuide', { name: player.name })}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
