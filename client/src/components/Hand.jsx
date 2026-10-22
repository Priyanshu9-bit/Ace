import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PlayingCard from './PlayingCard.jsx';
import { sounds } from '../sound.js';

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

/** The viewer's private hand with fan angle, multi-card cut selection, and interactive elevation. */
export default function Hand({ hand, legal, leadSuit, myTurn, onPlay, onIllegal, t }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const [selectedIds, setSelectedIds] = useState([]);

  // Check if player is cutting (lead suit exists and player has no cards of that suit)
  const hasLeadSuit = Boolean(leadSuit && hand.some((c) => c.suit === leadSuit));
  const isCutting = Boolean(leadSuit && !hasLeadSuit);

  // Drop selection when turn changes or selected cards no longer exist
  useEffect(() => {
    if (!myTurn) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => hand.some((c) => c.id === id)));
  }, [myTurn, hand]);

  const cardW = width < 480 ? 56 : width < 800 ? 70 : 84;
  const cardH = Math.round(cardW * 1.4);
  const n = hand.length;
  const step = n > 1 ? Math.min(cardW * 0.88, (width - cardW - 16) / (n - 1)) : 0;
  const total = cardW + step * Math.max(0, n - 1);
  const offset = Math.max(8, (width - total) / 2);
  const legalSet = new Set(legal);

  function handleClick(card) {
    if (!myTurn) return;
    if (!legalSet.has(card.id)) {
      sounds.error();
      onIllegal?.();
      return;
    }

    if (isCutting) {
      // In a cut: can select multiple cards of the same suit
      if (selectedIds.includes(card.id)) {
        if (selectedIds.length === 1) {
          // Double tap on a single selected cut card plays it immediately
          setSelectedIds([]);
          onPlay(card.id);
        } else {
          // Deselect this card from multi-card selection
          sounds.select();
          setSelectedIds((prev) => prev.filter((id) => id !== card.id));
        }
      } else {
        const currentSelected = hand.filter((c) => selectedIds.includes(c.id));
        if (currentSelected.length > 0 && currentSelected[0].suit === card.suit) {
          // Add this same-suit card to selection
          sounds.select();
          setSelectedIds((prev) => [...prev, card.id]);
        } else {
          // Different suit or first card: select this card
          sounds.select();
          setSelectedIds([card.id]);
        }
      }
    } else {
      // Normal play (following suit or leading trick): single card selection
      if (selectedIds.length === 1 && selectedIds[0] === card.id) {
        setSelectedIds([]);
        onPlay(card.id);
      } else {
        sounds.select();
        setSelectedIds([card.id]);
      }
    }
  }

  function handlePlaySelected() {
    if (selectedIds.length === 0) return;
    const cardsToPlay = selectedIds.length === 1 ? selectedIds[0] : [...selectedIds];
    setSelectedIds([]);
    onPlay(cardsToPlay);
  }

  return (
    <section className="hand-section" aria-label={t('yourHand')}>
      <div className="hand-bar">
        <span>
          🂠 {t('yourHand')}: <b>{n} {t('cards')}</b>
        </span>

        {myTurn && selectedIds.length > 0 && (
          <button
            type="button"
            className="btn btn-gold btn-small"
            onClick={handlePlaySelected}
          >
            ▶ {selectedIds.length > 1
              ? t('playCutMulti', { n: selectedIds.length })
              : t('play')}
          </button>
        )}

        {myTurn && selectedIds.length === 0 && (
          <span style={{ color: 'var(--gold)', fontSize: '12px' }}>
            {isCutting ? `✂️ ${t('cutHint')}` : `👆 ${t('tapAgain')}`}
          </span>
        )}
      </div>

      <div
        className="hand-deck-area"
        ref={ref}
        style={{ height: cardH + 34, '--card-w': `${cardW}px` }}
      >
        {hand.map((card, i) => {
          const isLegal = legalSet.has(card.id);
          const isSelected = selectedIds.includes(card.id);
          const arcFrac = n > 1 ? (i / (n - 1)) - 0.5 : 0;
          const rotDeg = isSelected ? 0 : Math.round(arcFrac * 14);
          const arcY = isSelected ? 0 : Math.round(Math.abs(arcFrac) * 8);

          return (
            <PlayingCard
              key={card.id}
              card={card}
              onClick={() => handleClick(card)}
              selected={isSelected}
              playable={myTurn && isLegal}
              dimmed={myTurn && !isLegal}
              style={{
                left: offset + i * step,
                transform: `rotate(${rotDeg}deg) translateY(${arcY}px)`,
                zIndex: isSelected ? 80 + i : 10 + i,
              }}
              className="in-hand"
            />
          );
        })}
      </div>
    </section>
  );
}
