import React, { useEffect, useState, useRef } from 'react';
import { sounds } from '../sound.js';

const SUIT_ICONS = ['♠', '♥', '♦', '♣'];

// Background floating particle definitions
const PARTICLES = [
  { id: 1, symbol: '♠', left: '12%', top: '20%', size: '20px', delay: '0s', dur: '5s' },
  { id: 2, symbol: '♦', left: '82%', top: '25%', size: '18px', delay: '1s', dur: '6s', isRed: true },
  { id: 3, symbol: '✦', left: '25%', top: '75%', size: '14px', delay: '0.5s', dur: '4.5s', isGold: true },
  { id: 4, symbol: '♥', left: '78%', top: '72%', size: '22px', delay: '1.5s', dur: '5.5s', isRed: true },
  { id: 5, symbol: '♣', left: '8%', top: '65%', size: '19px', delay: '2s', dur: '6.5s' },
  { id: 6, symbol: '✦', left: '88%', top: '48%', size: '12px', delay: '0.8s', dur: '4s', isGold: true },
  { id: 7, symbol: '♠', left: '50%', top: '12%', size: '16px', delay: '1.2s', dur: '5.2s' },
  { id: 8, symbol: '✦', left: '38%', top: '88%', size: '15px', delay: '2.5s', dur: '4.8s', isGold: true },
];

export default function WelcomeAnimation({ t, onDismiss, lang = 'en' }) {
  const [exiting, setExiting] = useState(false);
  const [fanned, setFanned] = useState(false);
  const [progress, setProgress] = useState(0);
  const dismissedRef = useRef(false);

  // Play fanfare sound on mount
  useEffect(() => {
    try {
      sounds.welcome();
    } catch {
      /* audio policy */
    }

    // Trigger card fan animation shortly after mount
    const fanTimer = setTimeout(() => {
      setFanned(true);
    }, 150);

    // Auto-progress bar over 3.2 seconds
    const startTime = Date.now();
    const duration = 3200;
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(progressInterval);
        handleDismiss();
      }
    }, 40);

    // Allow keyboard skip (Space, Enter, Escape)
    const handleKeyDown = (e) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(fanTimer);
      clearInterval(progressInterval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function handleDismiss() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    sounds.click();
    setExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 380);
  }

  return (
    <div
      className={`welcome-overlay ${exiting ? 'welcome-exiting' : ''}`}
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Gadhaa"
    >
      {/* Ambient background glow & radial light */}
      <div className="welcome-backdrop-rays" aria-hidden="true" />
      <div className="welcome-radial-spot" aria-hidden="true" />

      {/* Floating Sparkles and Suits */}
      <div className="welcome-particles" aria-hidden="true">
        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className={`welcome-particle ${p.isRed ? 'particle-red' : ''} ${p.isGold ? 'particle-gold' : ''}`}
            style={{
              left: p.left,
              top: p.top,
              fontSize: p.size,
              animationDelay: p.delay,
              animationDuration: p.dur,
            }}
          >
            {p.symbol}
          </span>
        ))}
      </div>

      {/* Skip Button Top Right */}
      <button
        type="button"
        className="welcome-skip-btn"
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
        aria-label={t('skipIntro')}
      >
        <span>{t('skipIntro')}</span>
        <span aria-hidden="true">✕</span>
      </button>

      {/* Center Presentation Stage */}
      <div
        className="welcome-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mascot Medallion with Crown */}
        <div className="welcome-mascot-container">
          <div className="welcome-halo-ring ring-1" aria-hidden="true" />
          <div className="welcome-halo-ring ring-2" aria-hidden="true" />
          <div className="welcome-mascot-circle">
            <span className="welcome-crown" aria-hidden="true">👑</span>
            <span className="welcome-donkey" aria-hidden="true">🫏</span>
          </div>
        </div>

        {/* 3D Fanned Playing Cards Display */}
        <div className={`welcome-card-fan ${fanned ? 'is-fanned' : ''}`} aria-hidden="true">
          {/* Card 1: ♣ Jack of Clubs */}
          <div className="welcome-fan-card card-club">
            <div className="fan-corner tl"><b>J</b><i>♣</i></div>
            <div className="fan-center">♣</div>
            <div className="fan-corner br"><b>J</b><i>♣</i></div>
          </div>

          {/* Card 2: ♦ Queen of Diamonds */}
          <div className="welcome-fan-card card-diamond card-red">
            <div className="fan-corner tl"><b>Q</b><i>♦</i></div>
            <div className="fan-center">♦</div>
            <div className="fan-corner br"><b>Q</b><i>♦</i></div>
          </div>

          {/* Card 3: ♥ King of Hearts */}
          <div className="welcome-fan-card card-heart card-red">
            <div className="fan-corner tl"><b>K</b><i>♥</i></div>
            <div className="fan-center">♥</div>
            <div className="fan-corner br"><b>K</b><i>♥</i></div>
          </div>

          {/* Card 4: ♠ Ace of Spades (Crown Jewel) */}
          <div className="welcome-fan-card card-ace card-ace-primary">
            <div className="fan-corner tl"><b>A</b><i>♠</i></div>
            <div className="fan-center ace-glyph">♠</div>
            <div className="fan-center-sub">GADHAA</div>
            <div className="fan-corner br"><b>A</b><i>♠</i></div>
            <div className="fan-foil-shine" />
          </div>
        </div>

        {/* Title & Branding */}
        <div className="welcome-title-group">
          <div className="welcome-flourish" aria-hidden="true">
            <span>✦</span>
            <span className="flourish-line" />
            <span className="flourish-suit">♠</span>
            <span className="flourish-line" />
            <span>✦</span>
          </div>

          <h1 className="welcome-main-title">
            <span className="welcome-name-en">GADHAA</span>
            <span className="welcome-name-or">ଗଧା</span>
          </h1>

          <p className="welcome-subtitle">
            {t('welcomeSubtitle')}
          </p>

          <p className="welcome-description">
            {t('welcomeTagline')}
          </p>
        </div>

        {/* Feature Highlights Pills */}
        <div className="welcome-features-row" aria-hidden="true">
          <div className="welcome-feature-pill">
            <span>🂠</span>
            <span>52 Cards</span>
          </div>
          <div className="welcome-feature-pill">
            <span>⚡</span>
            <span>Real-Time</span>
          </div>
          <div className="welcome-feature-pill">
            <span>🎙️</span>
            <span>Voice Chat</span>
          </div>
          <div className="welcome-feature-pill">
            <span>🏆</span>
            <span>Live Multiplayer</span>
          </div>
        </div>

        {/* Enter Game Action Button */}
        <div className="welcome-action-wrap">
          <button
            type="button"
            className="btn btn-gold btn-big welcome-enter-btn"
            onClick={handleDismiss}
          >
            <span>🎴</span>
            <span>{t('enterGame')}</span>
            <span className="btn-arrow" aria-hidden="true">➔</span>
          </button>
        </div>

        {/* Auto-advance Progress Bar */}
        <div className="welcome-progress-wrap" title="Auto-entering game...">
          <div
            className="welcome-progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
