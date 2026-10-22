import React from 'react';

export default function InstallModal({ t, onClose, onInstall, canPrompt, isIOS, isStandalone }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <div className="rules-modal install-modal">
        <div className="install-header center">
          <img
            src="/icons/icon-192.png"
            alt="Gadhaa App Icon"
            className="install-app-icon"
            width="88"
            height="88"
          />
          <h2 id="install-title" className="rules-title" style={{ marginTop: '12px', marginBottom: '6px' }}>
            {t('installTitle')}
          </h2>
          <p className="muted center" style={{ fontSize: '13px', lineHeight: '1.4', margin: '0 0 16px 0' }}>
            {t('installDesc')}
          </p>
        </div>

        {isStandalone ? (
          <div className="install-banner-success center">
            <span style={{ fontSize: '24px' }}>✓</span>
            <div>{t('installed')}</div>
          </div>
        ) : isIOS ? (
          <div className="ios-install-steps">
            <div className="ios-step-item">
              <span className="ios-step-num">1</span>
              <div>{t('installIosStep1')} <span className="ios-share-icon" aria-hidden="true">⎋</span></div>
            </div>
            <div className="ios-step-item">
              <span className="ios-step-num">2</span>
              <div>{t('installIosStep2')} <span className="ios-plus-icon" aria-hidden="true">⊞</span></div>
            </div>
          </div>
        ) : canPrompt ? (
          <button type="button" className="btn btn-gold btn-big" onClick={onInstall} style={{ width: '100%', marginBottom: '8px' }}>
            {t('installNow')}
          </button>
        ) : (
          <div className="ios-install-steps">
            <div className="ios-step-item">
              <span className="ios-step-num">📱</span>
              <div>Open browser menu (⋮) and tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></div>
            </div>
          </div>
        )}

        <button type="button" className="btn btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: '6px' }}>
          {t('close')}
        </button>
      </div>
    </div>
  );
}
