import React, { useEffect, useRef, useState } from 'react';

export default function VoiceBar({
  voiceState,
  isSpeaking,
  activePeersCount,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onSetVoiceTarget,
  peers = [],
  youId,
  guidingTarget = null,
  guidedBy = null,
  t,
  isSupported = true,
  busy = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  if (!isSupported) {
    return null;
  }

  const { active, isMuted, isDeafened, voiceTarget = 'all', peerTargets = {} } = voiceState;

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

  // Active voice peers we can speak to
  const availablePeers = peers.filter((p) => p.id && p.id !== youId);
  const currentTargetPeer = availablePeers.find((p) => p.id === voiceTarget);
  const isTargeted = voiceTarget && voiceTarget !== 'all';
  const targetLabel = isTargeted
    ? currentTargetPeer?.name || t('guide')
    : t('speakToAll');

  // Check if anyone is currently whispering directly to me
  const whisperingToMePeerId = Object.keys(peerTargets).find(
    (peerId) => peerTargets[peerId] === youId
  );
  const whisperingToMePeer = whisperingToMePeerId
    ? availablePeers.find((p) => p.id === whisperingToMePeerId)
    : null;

  return (
    <div
      className={`voice-bar voice-bar-active ${isSpeaking ? 'is-speaking' : ''} ${isTargeted ? 'is-targeted' : ''}`}
      role="region"
      aria-label={t('voiceChat')}
      ref={menuRef}
    >
      <div className="voice-status-group">
        <span
          className={`voice-indicator-dot ${isMuted ? 'muted' : isSpeaking ? 'speaking' : 'ready'}`}
          title={isMuted ? t('micMuted') : t('micActive')}
        />
        <span className="voice-count-text">
          {activePeersCount > 0 ? t('voiceConnected', { n: activePeersCount + 1 }) : t('voiceConnected', { n: 1 })}
        </span>
      </div>

      {/* Incoming Whisper Alert Banner */}
      {whisperingToMePeer && (
        <div
          className="voice-incoming-whisper-badge"
          title={t('whisperingToYou', { name: whisperingToMePeer.name })}
        >
          <span>🎧</span>
          <span className="whisper-text">
            {t('whisperingToYou', { name: whisperingToMePeer.name })}
          </span>
        </div>
      )}

      <div className="voice-controls-group">
        {/* Speak To: Target Selector Dropdown */}
        {availablePeers.length > 0 && (
          <div className="voice-target-wrapper">
            <button
              type="button"
              className={`voice-pill-btn voice-target-btn ${isTargeted ? 'btn-targeted' : ''}`}
              onClick={() => setMenuOpen(!menuOpen)}
              title={`${t('speakTo')}: ${targetLabel}`}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
            >
              <span className="voice-btn-icon">{isTargeted ? '🎯' : '🗣️'}</span>
              <span className="voice-btn-text voice-target-name">{targetLabel}</span>
              <span className="voice-chevron" aria-hidden="true">▾</span>
            </button>

            {menuOpen && (
              <div className="voice-target-dropdown" role="listbox">
                <div className="voice-target-dropdown-header">
                  <span>{t('speakTo')}</span>
                </div>

                {/* Option 1: Everyone */}
                <button
                  type="button"
                  className={`voice-target-item ${!isTargeted ? 'active' : ''}`}
                  onClick={() => {
                    onSetVoiceTarget?.('all');
                    setMenuOpen(false);
                  }}
                  role="option"
                  aria-selected={!isTargeted}
                >
                  <span className="target-item-icon">👥</span>
                  <div className="target-item-info">
                    <span className="target-item-name">{t('speakToAll')}</span>
                    <span className="target-item-desc">{t('voiceWebRtcNote')}</span>
                  </div>
                  {!isTargeted && <span className="target-check">✓</span>}
                </button>

                <div className="voice-target-divider" />

                {/* Option 2..N: Specific Peers (Direct Guide / Whisper) */}
                {availablePeers.map((p) => {
                  const isSelected = voiceTarget === p.id;
                  const isGuideMatch =
                    (guidingTarget && guidingTarget.targetId === p.id) ||
                    (guidedBy && guidedBy.id === p.id);

                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`voice-target-item ${isSelected ? 'active' : ''} ${isGuideMatch ? 'is-guide-partner' : ''}`}
                      onClick={() => {
                        onSetVoiceTarget?.(p.id);
                        setMenuOpen(false);
                      }}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span className="target-item-avatar">{p.avatar || '🫏'}</span>
                      <div className="target-item-info">
                        <span className="target-item-name">
                          {p.name}
                          {isGuideMatch && (
                            <span className="badge-guide-partner">
                              {guidingTarget?.targetId === p.id ? '🤝 Guiding' : '🤝 Mentor'}
                            </span>
                          )}
                        </span>
                        <span className="target-item-desc">
                          {isSelected ? t('whisperingTo', { name: p.name }) : t('whisperTarget', { name: p.name })}
                        </span>
                      </div>
                      {isSelected && <span className="target-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
