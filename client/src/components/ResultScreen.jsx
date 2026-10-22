import React from 'react';

export default function ResultScreen({ view, t, busy, onNewGame, onLeave }) {
  const { game, players, you } = view;
  const result = game.result;
  const iAmGadha = result.gadhaId === you.id;
  const finishOrder = result.finishOrder || [];

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
        <div className="donkey-mascot" aria-hidden="true">
          🫏
        </div>

        <p className="muted center" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>
          {t('gameOver')}
        </p>

        <h2 id="result-title" className="result-header">
          {iAmGadha ? t('youAreGadha') : t('gadhaIs')}
        </h2>

        <div className="gadha-title-name">
          {iAmGadha ? 'ଗଧା · GADHAA' : result.gadhaName}
        </div>

        <p className="muted center" style={{ fontSize: '13px', lineHeight: '1.4' }}>
          {t(`reason${result.reason}`)}
        </p>

        <ul className="podium-list">
          {ranked.map((p, idx) => {
            const isGadha = p.id === result.gadhaId;
            const isWinner = idx === 0 && !isGadha;
            return (
              <li key={p.id} className={`${isGadha ? 'gadha' : ''} ${isWinner ? 'winner' : ''}`}>
                <span>
                  {isGadha ? '🫏 ' : isWinner ? '👑 #1 ' : `#${idx + 1} `}
                  {p.name}
                  {p.id === you.id ? ` (${t('you')})` : ''}
                </span>
                <span>
                  {isGadha ? (
                    <b style={{ color: '#ff9999' }}>GADHAA (ଗଧ)</b>
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
          <button type="button" className="btn btn-ghost" onClick={onLeave} disabled={busy}>
            {t('leaveRoom')}
          </button>
        </div>
      </div>
    </div>
  );
}
