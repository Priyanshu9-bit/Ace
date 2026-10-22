import React from 'react';

export default function VoiceBar({
  voiceState,
  isSpeaking,
  activePeersCount,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  t,
  isSupported = true,
  busy = false,
}) {
  if (!isSupported) {
    return null;
  }

  const { active, isMuted, isDeafened } = voiceState;

  if (!active) {
    return (
      <div className="voice-bar voice-bar-inactive" role="region" aria-label={t('voiceChat')}>
        <button
          type="button"
          className="voice-btn voice-btn-join"
          onClick={onJoin}
          disabled={busy}
          title={t('joinVoice')}
        >
          <span className="voice-icon">🎙️</span>
          <span className="voice-label">{t('joinVoice')}</span>
          {activePeersCount > 0 && (
            <span className="voice-peer-badge" title={t('voiceConnected', { n: activePeersCount })}>
              {activePeersCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`voice-bar voice-bar-active ${isSpeaking ? 'is-speaking' : ''}`} role="region" aria-label={t('voiceChat')}>
      <div className="voice-status-group">
        <span
          className={`voice-indicator-dot ${isMuted ? 'muted' : isSpeaking ? 'speaking' : 'ready'}`}
          title={isMuted ? t('micMuted') : t('micActive')}
        />
        <span className="voice-count-text">
          {activePeersCount > 0 ? t('voiceConnected', { n: activePeersCount + 1 }) : t('voiceConnected', { n: 1 })}
        </span>
      </div>

      <div className="voice-controls-group">
        {/* Mic Mute / Unmute Button */}
        <button
          type="button"
          className={`voice-pill-btn ${isMuted ? 'btn-muted' : isSpeaking ? 'btn-speaking' : 'btn-active'}`}
          onClick={onToggleMute}
          title={isMuted ? t('unmuteMic') : t('muteMic')}
          aria-pressed={isMuted}
        >
          <span className="voice-btn-icon">{isMuted ? '🔇' : '🎙️'}</span>
          <span className="voice-btn-text">{isMuted ? t('micMuted') : t('micActive')}</span>
        </button>

        {/* Deafen / Undeafen Speaker Button */}
        <button
          type="button"
          className={`voice-pill-btn ${isDeafened ? 'btn-deafened' : ''}`}
          onClick={onToggleDeafen}
          title={isDeafened ? t('undeafen') : t('deafen')}
          aria-pressed={isDeafened}
        >
          <span className="voice-btn-icon">{isDeafened ? '🔇' : '🎧'}</span>
          <span className="voice-btn-text">{isDeafened ? t('deafen') : 'Audio'}</span>
        </button>

        {/* Leave Voice Button */}
        <button
          type="button"
          className="voice-pill-btn btn-leave"
          onClick={onLeave}
          title={t('leaveVoice')}
        >
          <span className="voice-btn-icon">✕</span>
        </button>
      </div>
    </div>
  );
}
