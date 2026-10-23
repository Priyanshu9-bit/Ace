import React, { useState } from 'react';

const RANDOM_NAMES = [
  'Kalia', 'Balia', 'Jagannath', 'Pintu', 'Raju',
  'Bulu', 'Tutu', 'Chiku', 'Litu', 'Muna', 'Sipun',
  'Sambit', 'Rakesh', 'Pooja', 'Rinky', 'Gudu'
];

export const AVATARS = ['🫏', '👑', '😎', '👳', '🐯', '🦚', '🦁', '🎴', '⚡', '💎', '🔥', '🦉'];

export default function Home({
  t,
  busy,
  error,
  errorCode,
  onCreate,
  onJoin,
  onJoinSpectator,
  initialName,
  initialAvatar,
  initialCode,
  onOpenRules,
  onOpenInstall,
  onOpenStats,
  stats,
  isStandalone,
}) {
  const [mode, setMode] = useState(initialCode ? 'join' : 'create'); // 'create' | 'join'
  const [name, setName] = useState(initialName || '');
  const [avatar, setAvatar] = useState(initialAvatar || '🫏');
  const [code, setCode] = useState(initialCode || '');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [asSpectator, setAsSpectator] = useState(false);

  function pickRandomName() {
    const random = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    setName(random);
  }

  function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (mode === 'create') {
      onCreate(name, maxPlayers, avatar);
    } else if (asSpectator) {
      onJoinSpectator(code, name, avatar);
    } else {
      onJoin(code, name, avatar);
    }
  }

  return (
    <main className="panel home">
      <div className="hero-logo" aria-hidden="true">
        <span className="hero-card">♠</span>
        <span className="hero-card red">♥</span>
        <span className="hero-card red">♦</span>
        <span className="hero-card">♣</span>
      </div>

      <h1 className="title">
        {t('appName')} {t('appName') === 'Gadhaa' && <span className="title-or">ଗଧା</span>}
      </h1>
      <p className="tagline">{t('tagline')}</p>

      {/* Player Stats Quick Record Card */}
      {onOpenStats && (
        <div
          className="home-stats-card"
          onClick={onOpenStats}
          role="button"
          tabIndex={0}
          title={t('viewStats')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onOpenStats();
          }}
        >
          <div className="home-stats-header">
            <span className="home-stats-title">
              <span aria-hidden="true">📊</span> {t('yourRecord')}
            </span>
            <span className="home-stats-more">{t('viewStats')} →</span>
          </div>
          <div className="home-stats-grid">
            <div className="home-stat-box is-gadha">
              <span className="home-stat-num">{stats?.gadhaCount || 0}</span>
              <span className="home-stat-label">🫏 {t('timesGadha')}</span>
            </div>
            <div className="home-stat-box is-safe">
              <span className="home-stat-num">{stats?.escapedCount || 0}</span>
              <span className="home-stat-label">👑 {t('timesSafe')}</span>
            </div>
            <div className="home-stat-box">
              <span className="home-stat-num">{stats?.totalGames || 0}</span>
              <span className="home-stat-label">🎮 {t('gamesPlayed')}</span>
            </div>
            <div className="home-stat-box">
              <span className="home-stat-num">
                {stats?.totalGames > 0 ? Math.round(((stats.gadhaCount || 0) / stats.totalGames) * 100) : 0}%
              </span>
              <span className="home-stat-label">📉 {t('gadhaRate')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'create'}
          className={`tab-btn ${mode === 'create' ? 'active' : ''}`}
          onClick={() => setMode('create')}
        >
          {t('createRoom')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'join'}
          className={`tab-btn ${mode === 'join' ? 'active' : ''}`}
          onClick={() => setMode('join')}
        >
          {t('joinRoom')}
        </button>
      </div>

      <form className="stack" onSubmit={submit}>
        <div className="field">
          <div className="field-header">
            <span>{t('yourName')}</span>
            <button
              type="button"
              className="field-random"
              onClick={pickRandomName}
            >
              🎲 {t('quickName')}
            </button>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            maxLength={20}
            autoComplete="nickname"
            autoFocus={!name}
            required
          />
        </div>

        <div className="field">
          <div className="field-header">
            <span>{t('chooseAvatar')}</span>
            <span className="avatar-badge">{avatar}</span>
          </div>
          <div className="avatar-grid" role="group" aria-label={t('chooseAvatar')}>
            {AVATARS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`avatar-btn ${avatar === emoji ? 'active' : ''}`}
                onClick={() => setAvatar(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {mode === 'create' && (
          <div className="field">
            <div className="field-header">
              <span>{t('playerLimit')}</span>
              <span className="field-badge">{t('playersCount', { n: maxPlayers })}</span>
            </div>
            <div className="limit-pill-group" role="group" aria-label={t('playerLimit')}>
              {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`limit-pill ${maxPlayers === num ? 'active' : ''}`}
                  onClick={() => setMaxPlayers(num)}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="field">
            <span>{t('roomCode')}</span>
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
              placeholder={t('codePlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              required
            />
          </div>
        )}

        {mode === 'join' && (
          <label className="row" style={{ alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', margin: '-2px 0 4px' }}>
            <input
              type="checkbox"
              checked={asSpectator}
              onChange={(e) => setAsSpectator(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--gold)' }}
            />
            <span>👀 {t('joinAsSpectator')}</span>
          </label>
        )}

        {error && (
          <div className="error-banner stack" role="alert" style={{ gap: '8px' }}>
            <div>{error}</div>
            {(errorCode === 'ROOM_FULL' || errorCode === 'GAME_IN_PROGRESS') && (
              <button
                type="button"
                className="btn btn-small"
                style={{ background: 'rgba(155, 89, 182, 0.4)', borderColor: '#9b59b6', color: '#fff', alignSelf: 'center' }}
                onClick={() => onJoinSpectator(code, name, avatar)}
              >
                👀 {t('watchLive')}
              </button>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-gold btn-big" disabled={busy}>
          {busy ? t('working') : mode === 'create' ? t('create') : asSpectator ? t('watchLive') : t('join')}
        </button>
      </form>

      <div className="row center" style={{ marginTop: '4px', gap: '8px', flexWrap: 'wrap' }}>
        {onOpenStats && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            style={{ color: 'var(--gold)', borderColor: 'rgba(245, 195, 66, 0.4)' }}
            onClick={onOpenStats}
          >
            📊 {t('stats')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={onOpenRules}
        >
          📖 {t('howToPlay')}
        </button>
        {!isStandalone && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            style={{ color: 'var(--gold)', borderColor: 'rgba(245, 195, 66, 0.4)' }}
            onClick={onOpenInstall}
          >
            📲 {t('installApp')}
          </button>
        )}
        <a
          href="/download/apk"
          className="btn btn-ghost btn-small apk-link-btn"
          target="_blank"
          rel="noopener noreferrer"
          title={t('apkNote')}
        >
          🤖 {t('downloadApk')}
        </a>
      </div>
      <p className="muted center" style={{ fontSize: '12px' }}>{t('inviteHint')}</p>

      {/* Developer Credit Footer */}
      <div className="home-creator-credit" aria-label="Created and developed by Priyanshu Panda">
        <span className="home-creator-label">CREATED &amp; DEVELOPED BY</span>
        <span className="home-creator-name">PRIYANSHU PANDA</span>
        <span className="home-creator-tagline">“Turning Ideas into Interactive Experiences.”</span>
      </div>
    </main>
  );
}
