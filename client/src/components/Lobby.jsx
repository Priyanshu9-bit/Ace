import React, { useState } from 'react';
import { AVATARS } from './Home.jsx';

export default function Lobby({
  view,
  t,
  busy,
  onStart,
  onLeave,
  onSetMaxPlayers,
  onSetAvatar,
  onOpenRules,
  onOpenStats,
  speakingMap,
  voiceBar,
}) {
  const [copied, setCopied] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const { players, you, code, minPlayers, maxPlayers, spectators, spectatorCount } = view;
  const canStart = you.isHost && players.length >= minPlayers && !busy;

  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* fallback failed */
      }
      document.body.removeChild(ta);
    }
    setCopied(which);
    setTimeout(() => setCopied(''), 2000);
  }

  const inviteLink = `${window.location.origin}/?room=${code}`;
  const whatsappText = encodeURIComponent(
    `🎴 Play Odia Gadhaa (ଗଧା) Card Game with me!\n\nRoom Code: *${code}*\nJoin link: ${inviteLink}`
  );
  const whatsappUrl = `https://api.whatsapp.com/send?text=${whatsappText}`;

  return (
    <main className="panel lobby">
      <h2>{t('lobby')}</h2>
      
      <div className="lobby-code-box">
        <p className="muted center" style={{ margin: 0 }}>{t('shareCode')}</p>
        <div className="room-code-display" aria-label={t('roomCode')}>
          {code.split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </div>
        <div className="row center" style={{ marginTop: '4px' }}>
          <button type="button" className="btn btn-small" onClick={() => copy(code, 'code')}>
            {copied === 'code' ? `✓ ${t('copied')}` : `📋 ${t('copyCode')}`}
          </button>
          <button type="button" className="btn btn-small" onClick={() => copy(inviteLink, 'link')}>
            {copied === 'link' ? `✓ ${t('copied')}` : `🔗 ${t('copyLink')}`}
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-small btn-whatsapp"
          >
            💬 {t('shareWhatsApp')}
          </a>
        </div>
      </div>

      {/* Voice Chat Controls */}
      {voiceBar && (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '2px 0' }}>
          {voiceBar}
        </div>
      )}

      {/* Table Capacity / Player Limit control */}
      <div className="lobby-limit-card">
        <div className="field-header" style={{ marginBottom: you.isHost ? '8px' : '0' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-gold)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            {t('playerLimit')}
          </span>
          <span className="field-badge">
            {t('playersCount', { n: maxPlayers })}
          </span>
        </div>
        {you.isHost ? (
          <div className="limit-pill-group" role="group" aria-label={t('playerLimit')}>
            {[2, 3, 4, 5, 6, 7, 8].map((num) => {
              const disabled = num < players.length;
              return (
                <button
                  key={num}
                  type="button"
                  disabled={disabled || busy}
                  title={disabled ? t('cannotBeLowerThanCurrent') : `${num} ${t('players')}`}
                  className={`limit-pill ${maxPlayers === num ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => onSetMaxPlayers && onSetMaxPlayers(num)}
                >
                  {num}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted center" style={{ margin: '4px 0 0', fontSize: '13px' }}>
            {t('hostSetLimit', { n: maxPlayers })}
          </p>
        )}
      </div>

      {/* Your Avatar Changer */}
      {!you.isSpectator && onSetAvatar && (
        <div className="avatar-selector-box">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-gold)' }}>
              {t('chooseAvatar')}
            </span>
            <button
              type="button"
              className="pill-btn"
              style={{ padding: '3px 10px', fontSize: '12px' }}
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}
            >
              <span style={{ fontSize: '16px' }}>{you.avatar || '🫏'}</span> {showAvatarPicker ? '▲' : '▼'}
            </button>
          </div>
          {showAvatarPicker && (
            <div className="avatar-grid" style={{ marginTop: '4px' }}>
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`avatar-btn ${you.avatar === emoji ? 'active' : ''}`}
                  onClick={() => {
                    onSetAvatar(emoji);
                    setShowAvatarPicker(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spectator list */}
      {spectatorCount > 0 && (
        <div style={{ background: 'rgba(0, 0, 0, 0.25)', borderRadius: '12px', padding: '10px 14px' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#d7bde2' }}>
              👀 {t('spectators')} ({spectatorCount})
            </span>
          </div>
          <div className="spectator-list">
            {spectators.map((s) => (
              <span key={s.id} className="spectator-pill">
                <span>{s.avatar || '👀'}</span>
                <span>{s.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Room Donkey Tally if games played in this room */}
      {view.roomStats && view.roomStats.gamesPlayed > 0 && (
        <div className="lobby-scoreboard-card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-gold)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              🫏 {t('roomScoreboard')}
            </span>
            <span className="field-badge">{view.roomStats.gamesPlayed} {t('matches')}</span>
          </div>
          <div className="lobby-scoreboard-grid">
            {players.map((p) => {
              const count = view.roomStats?.scores?.[p.id]?.gadhaCount || 0;
              const isYou = p.id === you.id;
              return (
                <div key={p.id} className={`lobby-scoreboard-pill ${count > 0 ? 'has-gadha' : ''} ${isYou ? 'is-me' : ''}`}>
                  <span>{p.avatar || '🫏'}</span>
                  <span className="scoreboard-pill-name">{p.name}</span>
                  <span className="scoreboard-pill-count">{count > 0 ? `🫏 ${count}` : `✓ ${t('safe')}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          {t('players')} ({players.length}/{maxPlayers})
        </h3>
        <div className="row" style={{ gap: '6px' }}>
          {onOpenStats && (
            <button type="button" className="btn btn-ghost btn-small" onClick={onOpenStats} title={t('viewStats')}>
              📊 {t('stats')}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-small" onClick={onOpenRules}>
            📖 {t('howToPlay')}
          </button>
        </div>
      </div>

      <ul className="player-list">
        {players.map((p) => {
          const isYou = p.id === you.id;
          const isSpeaking = speakingMap?.get(p.id) || (isYou && speakingMap?.get('me'));
          const isVoiceActive = p.voice?.active;
          const isVoiceMuted = p.voice?.muted;
          const pRoomGadha = view.roomStats?.scores?.[p.id]?.gadhaCount || 0;

          return (
            <li
              key={p.id}
              className={`${isYou ? 'me' : ''} ${p.connected ? '' : 'away'} ${isSpeaking ? 'is-speaking' : ''}`}
            >
              <div className="player-avatar-mini" style={{ fontSize: '18px', background: 'transparent' }}>
                {p.avatar || '🫏'}
              </div>
              <div className="player-list-name">
                {p.name}
              </div>
              <div className="row" style={{ gap: '4px', alignItems: 'center' }}>
                {pRoomGadha > 0 && (
                  <span className="badge badge-gadha-tally" title={`${t('timesGadha')}: ${pRoomGadha}`}>
                    🫏 {pRoomGadha}
                  </span>
                )}
                {isVoiceActive && (
                  <span
                    className={`lobby-voice-icon ${isVoiceMuted ? 'muted' : isSpeaking ? 'speaking' : 'active'}`}
                    title={isVoiceMuted ? t('micMuted') : isSpeaking ? t('voiceChat') : t('micActive')}
                  >
                    {isVoiceMuted ? '🔇' : '🎙️'}
                  </span>
                )}
                {p.isHost && <span className="badge badge-host">{t('host')}</span>}
                {isYou && <span className="badge badge-you">{t('you')}</span>}
                {!p.connected && <span className="badge badge-offline">{t('offline')}</span>}
              </div>
            </li>
          );
        })}
      </ul>

      {you.isHost ? (
        <div className="stack">
          <button type="button" className="btn btn-gold btn-big" disabled={!canStart} onClick={onStart}>
            {busy ? t('working') : t('startGame')}
          </button>
          {players.length < minPlayers && (
            <p className="muted center">{t('needPlayers', { n: minPlayers })}</p>
          )}
        </div>
      ) : (
        <p className="muted center" role="status" style={{ padding: '8px 0' }}>
          ⏳ {t('waitingForHost')}
        </p>
      )}

      <button type="button" className="btn btn-ghost" onClick={onLeave} disabled={busy}>
        {t('leaveRoom')}
      </button>
    </main>
  );
}
