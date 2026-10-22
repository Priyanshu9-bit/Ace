import React from 'react';

export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK_NAME = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' };

// Pip positions (x%, y%) inside the card face, like a real deck.
const L = 29, C = 50, R = 71;
const PIPS = {
  '2': [[C, 17], [C, 83]],
  '3': [[C, 17], [C, 50], [C, 83]],
  '4': [[L, 17], [R, 17], [L, 83], [R, 83]],
  '5': [[L, 17], [R, 17], [C, 50], [L, 83], [R, 83]],
  '6': [[L, 17], [R, 17], [L, 50], [R, 50], [L, 83], [R, 83]],
  '7': [[L, 17], [R, 17], [C, 33], [L, 50], [R, 50], [L, 83], [R, 83]],
  '8': [[L, 17], [R, 17], [C, 33], [L, 50], [R, 50], [C, 67], [L, 83], [R, 83]],
  '9': [[L, 17], [R, 17], [L, 39], [R, 39], [C, 50], [L, 61], [R, 61], [L, 83], [R, 83]],
  '10': [[L, 17], [R, 17], [C, 28], [L, 39], [R, 39], [L, 61], [R, 61], [C, 72], [L, 83], [R, 83]],
};

export function cardLabel(card) {
  return `${RANK_NAME[card.rank] || card.rank} of ${SUIT_NAME[card.suit]}`;
}

/**
 * A playing card. Size is driven by the CSS variable --card-w (set by the parent),
 * so the same component works in the hand, on the table and in the result screen.
 */
export default function PlayingCard({
  card,
  faceDown = false,
  onClick,
  selected = false,
  dimmed = false,
  playable = false,
  highlight = false,
  style,
  className = '',
}) {
  const interactive = typeof onClick === 'function';
  const classes = [
    'pcard',
    faceDown ? 'pcard-back' : `pcard-face suit-${card.suit}`,
    selected ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    playable ? 'is-playable' : '',
    highlight ? 'is-highlight' : '',
    className,
  ].join(' ');

  const content = faceDown ? (
    <span className="pcard-back-pattern" aria-hidden="true" />
  ) : (
    <>
      <span className="pcard-corner tl">
        <b>{card.rank}</b>
        <i>{SUIT_SYMBOL[card.suit]}</i>
      </span>
      <span className="pcard-corner br">
        <b>{card.rank}</b>
        <i>{SUIT_SYMBOL[card.suit]}</i>
      </span>
      <span className="pcard-centre" aria-hidden="true">
        {PIPS[card.rank] ? (
          PIPS[card.rank].map(([x, y], i) => (
            <span key={i} className={`pip ${y > 50 ? 'flip' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
              {SUIT_SYMBOL[card.suit]}
            </span>
          ))
        ) : card.rank === 'A' ? (
          <span className="pip ace" style={{ left: '50%', top: '50%' }}>{SUIT_SYMBOL[card.suit]}</span>
        ) : (
          <span className="court">
            <span className="court-rank">{card.rank}</span>
            <span className="court-suit">{SUIT_SYMBOL[card.suit]}</span>
          </span>
        )}
      </span>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        aria-label={cardLabel(card)}
        aria-pressed={selected}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={classes} style={style} role="img" aria-label={faceDown ? 'Face-down card' : cardLabel(card)}>
      {content}
    </div>
  );
}
