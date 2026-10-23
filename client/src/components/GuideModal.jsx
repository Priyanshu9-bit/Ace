import React from 'react';

export default function GuideModal({ request, onAccept, onDecline, t }) {
  if (!request) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-modal-title">
      <div className="modal-content guide-modal-content">
        <div className="guide-modal-header">
          <span className="guide-modal-icon" aria-hidden="true">🤝</span>
          <h2 id="guide-modal-title">{t('guideRequestTitle')}</h2>
        </div>

        <div className="guide-modal-body">
          <div className="guide-requester-badge">
            <span className="guide-requester-avatar">{request.fromAvatar || '🫏'}</span>
            <span className="guide-requester-name">{request.fromName}</span>
          </div>

          <p className="guide-modal-text">
            {t('guideRequestPrompt', { name: request.fromName })}
          </p>

          <div className="guide-feature-tips">
            <div className="guide-tip-item">
              <span>👁️</span>
              <span>{t('guideAdviceHint')}</span>
            </div>
            <div className="guide-tip-item">
              <span>🎙️</span>
              <span>{t('whisperTarget', { name: request.fromName })}</span>
            </div>
          </div>
        </div>

        <div className="guide-modal-actions">
          <button
            type="button"
            className="btn btn-gold btn-big guide-btn-accept"
            onClick={onAccept}
          >
            ✅ {t('allowGuide')}
          </button>
          <button
            type="button"
            className="btn btn-ghost guide-btn-decline"
            onClick={onDecline}
          >
            ✕ {t('declineGuide')}
          </button>
        </div>
      </div>
    </div>
  );
}
