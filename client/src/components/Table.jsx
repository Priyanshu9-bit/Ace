import React, { useEffect, useMemo, useRef, useState } from 'react';
import PlayingCard, { SUIT_SYMBOL } from './PlayingCard.jsx';

/** Percent coordinates on the felt for a seat, with the viewer at the bottom and play going clockwise. */
function seatGeometry(rel, n) {
  const theta = Math.PI / 2 + (rel * 2 * Math.PI) / n;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    avatar: { x: 50 + 40 * c, y: 50 + 38 * s },
    slot: { x: 50 + 16 * c, y: 50 + 16 * s },
    rot: ((rel * 37 + 11) % 21) - 10, // small stable "tossed on the table" tilt
  };
}

/** A card that glides from `from` to `to` (percent coords) as soon as it mounts. */
function FlyCard({ card, from, to, rot, fadeOut = false, highlight = false, z = 1 }) {
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setLanded(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  const pos = landed ? to : from;
  return (
    <div
      className={`fly ${highlight ? 'is-winner' : ''}`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        zIndex: z,
        opacity: landed && fadeOut ? 0 : 1,
        transform: `translate(-50%, -50%) rotate(${landed ? rot : 0}deg) scale(${landed && fadeOut ? 0.35 : 1})`,
      }}
    >
      <PlayingCard card={card} highlight={highlight} />
    </div>
  );
}

function TurnTimerRing({ startedAt, timeoutMs }) {
  const [fraction, setFraction] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(20);

  useEffect(() => {
    if (!startedAt) return undefined;
    const totalMs = timeoutMs || 20000;
    const update = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, totalMs - elapsed);
      setFraction(Math.min(1, Math.max(0, remaining / totalMs)));
      setSecondsLeft(Math.ceil(remaining / 1000));
    };
    update();
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [startedAt, timeoutMs]);

  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - fraction);
  const isUrgent = secondsLeft <= 5;

  return (
    <div className={`turn-timer-container ${isUrgent ? 'urgent' : ''}`} title={`${secondsLeft}s`}>
      <svg className="turn-timer-svg" viewBox="0 0 32 32">
        <circle className="timer-track" cx="16" cy="16" r={radius} />
        <circle
          className="timer-fill"
          cx="16"
          cy="16"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <span className="turn-timer-text">{secondsLeft}</span>
    </div>
  );
}

export default function Table({ view, t, speakingMap, gadhaBraying, onRequestGuide }) {
  const { players, you, game } = view;
  const n = players.length;
  const viewerSeat = you.seat >= 0 ? you.seat : 0;
  const geo = useMemo(
    () => players.map((p) => seatGeometry((p.seat - viewerSeat + n) % n, n)),
    [players, viewerSeat, n]
  );

  // Collect animation: when a finished round is awarded, fly its cards to the winner.
  const [collecting, setCollecting] = useState(null);
  const lastSeq = useRef(game?.lastTrick?.seq ?? 0);
  useEffect(() => {
    const lt = game?.lastTrick;
    if (!lt) {
      lastSeq.current = 0;
      return undefined;
    }
    if (lt.seq > lastSeq.current) {
      lastSeq.current = lt.seq;
      setCollecting(lt);
      const id = setTimeout(() => setCollecting(null), 900);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [game?.lastTrick]);

  // Banner naming the round winner for a moment after each round.
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    if (!collecting) return undefined;
    setBanner(collecting);
    const id = setTimeout(() => setBanner(null), 1700);
    return () => clearTimeout(id);
  }, [collecting]);

  const nameOf = (seat) => players[seat]?.name ?? '';
  const turnSeat = game.turnSeat;
  const isResolvingCut = game.resolving && game.isCut;
  const isCutBanner = isResolvingCut || (banner && banner.isCut);
  const winnerSeat = game.resolving ? game.pendingWinnerSeat : null;

  let status;
  if (game.resolving) {
    if (isResolvingCut) {
      status = t('cutRound', {
        cutter: nameOf(game.pendingCutterSeat),
        penalty: nameOf(game.pendingPenaltySeat),
      });
    } else {
      status = t('clearedRound', { name: nameOf(game.pendingWinnerSeat) });
    }
  } else if (game.awaitingAce && turnSeat === you.seat) {
    status = t('playAce');
  } else if (game.awaitingAce && turnSeat !== null) {
    status = t('waitingAce', { name: nameOf(turnSeat) });
  } else if (turnSeat === you.seat) {
    status = t('yourTurn');
  } else if (turnSeat !== null) {
    status = t('turnOf', { name: nameOf(turnSeat) });
  } else if (banner) {
    if (banner.isCut) {
      status = t('cutRound', {
        cutter: nameOf(banner.cutterSeat),
        penalty: nameOf(banner.penaltySeat),
      });
    } else {
      status = t('clearedRound', { name: nameOf(banner.winnerSeat) });
    }
  } else {
    status = '';
  }

  return (
    <div className="table-felt" aria-label="Card table">
      <div className="felt-stitch" />

      {/* Spectator Badges */}
      {view.spectatorCount > 0 && (
        <div style={{ position: 'absolute', top: '10px', right: '14px', zIndex: 10 }}>
          <span className="spectator-badge">👀 {view.spectatorCount}</span>
        </div>
      )}
      {you.isSpectator && (
        <div style={{ position: 'absolute', top: '10px', left: '14px', zIndex: 10 }}>
          <span className="spectator-badge">👀 {t('spectating')}</span>
        </div>
      )}

      {/* Centre Insignia & Status */}
      <div className="felt-insignia">
        <div className="felt-emblem">ଗଧ</div>
        <div className="felt-suits">
          <span>♠</span>
          <span style={{ color: 'var(--red)' }}>♥</span>
          <span style={{ color: 'var(--red)' }}>♦</span>
          <span>♣</span>
        </div>

        {game.leadSuit && (
          <div className="lead-suit-pill">
            <span>{t('leadSuit')}:</span>
            <span className={`lead-badge suit-${game.leadSuit}`}>
              {SUIT_SYMBOL[game.leadSuit]}
            </span>
          </div>
        )}

        {status && (
          <div
            className={`felt-status-banner ${isCutBanner ? 'is-cut' : ''}`}
            role="status"
            aria-live="polite"
          >
            {status}
          </div>
        )}
      </div>

      {/* Seats around the table */}
      {players.map((p) => {
        const g = geo[p.seat];
        const isTurn = turnSeat === p.seat;
        const isWinner = !isResolvingCut && (winnerSeat === p.seat || (banner && !banner.isCut && banner.winnerSeat === p.seat));
        const isPenalized = (isResolvingCut && game.pendingPenaltySeat === p.seat) || (banner && banner.isCut && banner.penaltySeat === p.seat);
        const isSpeaking = speakingMap?.get(p.id) || (p.seat === you.seat && speakingMap?.get('me'));
        const isVoiceActive = p.voice?.active;
        const isVoiceMuted = p.voice?.muted;
        const isGadha = game?.result && p.id === game.result.gadhaId;
        const isGadhaBraying = !!(isGadha && gadhaBraying);

        return (
          <div
            key={p.id}
            className={[
              'seat-pod',
              p.seat === you.seat ? 'me' : '',
              isTurn ? 'turn' : '',
              isWinner ? 'winner' : '',
              isPenalized ? 'penalized' : '',
              isSpeaking ? 'is-speaking' : '',
              isGadhaBraying ? 'is-gadha-braying' : '',
              !p.connected ? 'away' : '',
            ].filter(Boolean).join(' ')}
            style={{ left: `${g.avatar.x}%`, top: `${g.avatar.y}%` }}
          >
            {isGadhaBraying && (
              <div className="table-felt-speech-bubble" aria-hidden="true">
                🫏 Dheenchhu! 🔊
              </div>
            )}
            {isTurn && (
              <TurnTimerRing
                startedAt={game.turnStartedAt || view.turnStartedAt}
                timeoutMs={game.turnTimeoutMs || view.turnTimeoutMs}
              />
            )}
            <div className="seat-pod-name">
              <span className="avatar-badge">{p.avatar || '🫏'}</span>
              {isWinner && <span aria-hidden="true">👑</span>}
              {isPenalized && <span aria-hidden="true">📥</span>}
              <span>{p.seat === you.seat ? `${p.name} (${t('you')})` : p.name}</span>
              {isVoiceActive && (
                <span
                  className={`seat-voice-icon ${isVoiceMuted ? 'muted' : isSpeaking ? 'speaking' : 'active'}`}
                  title={isVoiceMuted ? t('micMuted') : isSpeaking ? t('voiceChat') : t('micActive')}
                >
                  {isVoiceMuted ? '🔇' : '🎙️'}
                </span>
              )}
            </div>
            <div className="seat-pod-stats">
              <span>🂠 {p.cardCount}</span>
              {p.cardCount === 0 && <span className="badge-safe">✓ {t('safe')}</span>}
              {view.game?.guiding && view.game.guiding.targetId === p.id && (
                <span className="badge-pod-guiding" title={t('guidingPlayer', { name: p.name })}>
                  🤝 {t('guide')}
                </span>
              )}
              {p.seat === you.seat && view.game?.guidedBy && (
                <span className="badge-pod-guided" title={t('guidedBy', { name: view.game.guidedBy.name })}>
                  🤝 {view.game.guidedBy.name}
                </span>
              )}
              {view.roomStats?.scores?.[p.id]?.gadhaCount > 0 && (
                <span className="badge-pod-gadha" title={`${t('timesGadha')}: ${view.roomStats.scores[p.id].gadhaCount}`}>
                  🫏 {view.roomStats.scores[p.id].gadhaCount}
                </span>
              )}
            </div>

            {/* Safe player action: quick guide button on pod */}
            {view.phase === 'playing' &&
              you.seat >= 0 &&
              !you.isSpectator &&
              view.game?.hand?.length === 0 &&
              p.cardCount > 0 &&
              p.seat !== you.seat &&
              !view.game?.guiding &&
              onRequestGuide && (
                <button
                  type="button"
                  className="pod-guide-btn"
                  onClick={() => onRequestGuide(p.id)}
                  title={t('requestToGuide', { name: p.name })}
                >
                  {view.outgoingGuideRequest?.targetId === p.id ? '⏳' : '👁️'} {t('guide')}
                </button>
              )}
            {!p.connected && (
              <div style={{ color: '#ff9999', fontSize: '10px' }}>
                {p.left ? t('left') : t('offline')}
              </div>
            )}
          </div>
        );
      })}

      {/* Cards currently played on table in this round */}
      {(() => {
        const seatCounts = {};
        return game.trick.map((play, i) => {
          const seatIdx = seatCounts[play.seat] || 0;
          seatCounts[play.seat] = seatIdx + 1;
          const baseSlot = geo[play.seat].slot;
          const slot = {
            x: baseSlot.x + seatIdx * 3,
            y: baseSlot.y + seatIdx * 2.5,
          };
          const rot = geo[play.seat].rot + seatIdx * 6;
          return (
            <FlyCard
              key={`${play.card.id}-${i}`}
              card={play.card}
              from={geo[play.seat].avatar}
              to={slot}
              rot={rot}
              highlight={winnerSeat === play.seat}
              z={10 + i}
            />
          );
        });
      })()}

      {/* Finished round cards flying to penalty seat or discarding into center */}
      {collecting &&
        (() => {
          const seatCounts = {};
          return collecting.plays.map((play, i) => {
            const seatIdx = seatCounts[play.seat] || 0;
            seatCounts[play.seat] = seatIdx + 1;
            const baseSlot = geo[play.seat].slot;
            const slot = {
              x: baseSlot.x + seatIdx * 3,
              y: baseSlot.y + seatIdx * 2.5,
            };
            return (
              <FlyCard
                key={`c${collecting.seq}-${play.card.id}-${i}`}
                card={play.card}
                from={slot}
                to={collecting.isCut ? geo[collecting.penaltySeat].avatar : { x: 50, y: 50 }}
                rot={0}
                fadeOut
                z={20 + i}
              />
            );
          });
        })()}
    </div>
  );
}
