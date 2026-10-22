import React from 'react';

export default function RulesModal({ t, onClose }) {
  const rules = [
    { icon: '🂠', text: t('rule1') },
    { icon: '🎯', text: t('rule2') },
    { icon: '✂️', text: t('rule3') },
    { icon: '🫏', text: t('rule4') },
  ];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div className="rules-modal">
        <h2 id="rules-title" className="rules-title">
          {t('rulesTitle')}
        </h2>
        <div className="stack">
          {rules.map((r, i) => (
            <div key={i} className="rule-item">
              <span className="rule-icon">{r.icon}</span>
              <div>{r.text}</div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-gold" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </div>
  );
}
