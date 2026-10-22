import React, { useCallback, useEffect, useRef, useState } from 'react';
import { socket, request, loadSession, saveSession, clearSession } from './socket.js';
import { translate, translateError } from './i18n.js';
import { sounds, isMuted, setMuted } from './sound.js';
import Home from './components/Home.jsx';
import Lobby from './components/Lobby.jsx';
import Table from './components/Table.jsx';
import Hand from './components/Hand.jsx';
import ResultScreen from './components/ResultScreen.jsx';
import RulesModal from './components/RulesModal.jsx';
import VoiceBar from './components/VoiceBar.jsx';
import WelcomeAnimation from './components/WelcomeAnimation.jsx';
import { VoiceManager } from './voice.js';

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Plays sound effects when the game state changes in an interesting way. */
function useGameSounds(view) {
  const prev = useRef({ trick: 0, seq: null, myTurn: false, phase: null, cutSeq: null });
  useEffect(() => {
    const g = view?.game;
    const p = prev.current;
    if (!g) {
      prev.current = { trick: 0, seq: null, myTurn: false, phase: view?.phase ?? null, cutSeq: null };
      return;
    }
    if (g.trick.length > p.trick) {
      sounds.play();
    }
    if (g.lastTrick && p.seq !== null && g.lastTrick.seq > p.seq) {
      if (g.lastTrick.isCut) sounds.cut();
      else sounds.collect();
    }
    const myTurn = g.turnSeat !== null && g.turnSeat === view.you.seat;
    if (myTurn && !p.myTurn) {
      sounds.turn();
    }
    if (view.phase === 'finished' && p.phase !== 'finished' && g.result) {
      if (g.result.gadhaId === view.you.id) sounds.lose();
      else sounds.win();
    }
    prev.current = {
      trick: g.trick.length,
      seq: g.lastTrick ? g.lastTrick.seq : 0,
      myTurn,
      phase: view.phase,
      cutSeq: p.cutSeq,
    };
  }, [view]);
}

export default function App() {
  const [lang, setLang] = useState(() => (readStorage('gadha.lang', 'en') === 'or' ? 'or' : 'en'));
  const [theme, setTheme] = useState(() => readStorage('gadha.theme', 'felt-classic'));
  const [avatar, setAvatarState] = useState(() => readStorage('gadha.avatar', '🫏'));
  const [muted, setMutedState] = useState(isMuted());
  const [conn, setConn] = useState(socket.connected ? 'online' : 'connecting');
  const [restoring, setRestoring] = useState(() => !!loadSession());
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [toast, setToast] = useState(null); // { key } | { error }
  const [showResult, setShowResult] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [initialCode] = useState(() => {
    const c = new URLSearchParams(window.location.search).get('room');
    return c ? c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '';
  });

  const voiceManagerRef = useRef(null);
  if (!voiceManagerRef.current) {
    voiceManagerRef.current = new VoiceManager();
  }
  const voiceManager = voiceManagerRef.current;
  const [voiceState, setVoiceState] = useState({
    active: false,
    isMuted: false,
    isDeafened: false,
    peerCount: 0,
  });
  const [speakingMap, setSpeakingMap] = useState(new Map());
  const [voiceBusy, setVoiceBusy] = useState(false);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  useGameSounds(view);

  useEffect(() => {
    document.documentElement.lang = lang;
    writeStorage('gadha.lang', lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStorage('gadha.theme', theme);
  }, [theme]);

  function cycleTheme() {
    const themes = ['felt-classic', 'felt-crimson', 'felt-midnight'];
    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    setTheme(next);
  }

  // ----- connection lifecycle -----
  useEffect(() => {
    async function restoreSession() {
      const s = loadSession();
      if (!s) {
        setRestoring(false);
        return;
      }
      const res = await request('room:rejoin', { code: s.code, token: s.token });
      if (!res.ok && res.error.code !== 'NETWORK' && res.error.code !== 'ALREADY_IN_ROOM') {
        clearSession(); // seat expired or gone
        setView(null);
      }
      setRestoring(false);
    }
    const onConnect = () => {
      setConn('online');
      restoreSession();
    };
    const onDisconnect = () => setConn('offline');
    const onState = (v) => setView(v);
    const onReplaced = () => {
      voiceManager.leave();
      setView(null);
      setToast({ key: 'replaced' });
    };

    voiceManager.init({
      socket,
      request,
      iceServers: null,
      myPlayerId: null,
      onStateChange: (s) => setVoiceState(s),
      onSpeakingChange: (m) => setSpeakingMap(m),
      onError: (err) => {
        setToast({ error: err.code || 'MIC_ERROR' });
      },
    });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on('state', onState);
    socket.on('session:replaced', onReplaced);
    if (socket.connected) onConnect();
    else socket.connect();
    return () => {
      voiceManager.destroy();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off('state', onState);
      socket.off('session:replaced', onReplaced);
    };
  }, []);

  useEffect(() => {
    if (view) {
      voiceManager.updateConfig({
        iceServers: view.iceServers,
        myPlayerId: view.you?.id,
      });
    }
  }, [view?.iceServers, view?.you?.id]);

  // Toasts auto-dismiss
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // Show the Gadha announcement after a brief pause so table outcome is clearly seen
  const finished = view?.phase === 'finished';
  useEffect(() => {
    if (!finished) {
      setShowResult(false);
      return undefined;
    }
    const id = setTimeout(() => setShowResult(true), 1500);
    return () => clearTimeout(id);
  }, [finished]);

  // ----- actions -----
  async function run(fn) {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }
  const fail = (res) => setToast({ error: res.error?.code || 'INTERNAL' });

  async function createRoom(name, maxPlayers, chosenAvatar) {
    setErrorCode('');
    const av = chosenAvatar || avatar;
    const res = await run(() => request('room:create', { name, maxPlayers, avatar: av }));
    if (!res.ok) return setErrorCode(res.error.code);
    saveSession({ code: res.code, token: res.token });
    writeStorage('gadha.name', name.trim());
    writeStorage('gadha.avatar', av);
    setAvatarState(av);
    return undefined;
  }

  async function setMaxPlayers(maxPlayers) {
    const res = await run(() => request('room:setMaxPlayers', { maxPlayers }));
    if (!res.ok) fail(res);
  }

  async function setPlayerAvatar(newAvatar) {
    writeStorage('gadha.avatar', newAvatar);
    setAvatarState(newAvatar);
    const res = await request('room:setAvatar', { avatar: newAvatar });
    if (!res.ok) fail(res);
  }

  async function joinRoom(code, name, chosenAvatar) {
    setErrorCode('');
    const av = chosenAvatar || avatar;
    const res = await run(() => request('room:join', { code, name, avatar: av }));
    if (!res.ok) return setErrorCode(res.error.code);
    saveSession({ code: res.code, token: res.token });
    writeStorage('gadha.name', name.trim());
    writeStorage('gadha.avatar', av);
    setAvatarState(av);
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
    return undefined;
  }

  async function joinSpectator(code, name, chosenAvatar) {
    setErrorCode('');
    const av = chosenAvatar || avatar;
    const res = await run(() => request('room:spectate', { code, name, avatar: av }));
    if (!res.ok) return setErrorCode(res.error.code);
    saveSession({ code: res.code, token: res.token });
    writeStorage('gadha.name', name.trim());
    writeStorage('gadha.avatar', av);
    setAvatarState(av);
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
    return undefined;
  }

  async function leaveRoom() {
    voiceManager.leave();
    await run(() => request('room:leave'));
    clearSession();
    setView(null);
    setShowResult(false);
  }

  async function handleJoinVoice() {
    setVoiceBusy(true);
    try {
      await voiceManager.join();
    } finally {
      setVoiceBusy(false);
    }
  }

  function handleLeaveVoice() {
    voiceManager.leave();
  }

  function handleToggleVoiceMute() {
    voiceManager.toggleMute();
  }

  function handleToggleVoiceDeafen() {
    voiceManager.toggleDeafen();
  }

  async function startGame() {
    const res = await run(() => request('game:start'));
    if (!res.ok) fail(res);
  }

  async function newGame() {
    const res = await run(() => request('game:new'));
    if (!res.ok) fail(res);
  }

  async function playCard(cardInput) {
    const payload = Array.isArray(cardInput) ? { cardIds: cardInput } : { cardId: cardInput };
    const res = await request('game:play', payload);
    if (!res.ok) {
      sounds.error();
      fail(res);
    }
  }

  function toggleMute() {
    setMuted(!muted);
    setMutedState(!muted);
  }

  // ----- render -----
  const toastText = toast ? (toast.error ? translateError(lang, toast.error) : t(toast.key)) : '';
  const inGame = view && (view.phase === 'playing' || view.phase === 'finished');
  const connecting = restoring || (conn === 'connecting' && !view);

  let body;
  if (connecting) {
    body = (
      <main className="panel center" role="status" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '36px', animation: 'spin 1.5s linear infinite' }}>🂠</div>
        <p className="muted">{t('connecting')}</p>
      </main>
    );
  } else if (!view) {
    body = (
      <Home
        t={t}
        busy={busy}
        error={errorCode ? translateError(lang, errorCode) : ''}
        errorCode={errorCode}
        onCreate={createRoom}
        onJoin={joinRoom}
        onJoinSpectator={joinSpectator}
        initialName={readStorage('gadha.name', '')}
        initialAvatar={avatar}
        initialCode={initialCode}
        onOpenRules={() => setShowRules(true)}
      />
    );
  } else if (view.phase === 'lobby') {
    const activeVoiceCount = [...view.players, ...(view.spectators || [])].filter((p) => p.voice?.active).length;
    const otherActivePeersCount = Math.max(0, activeVoiceCount - (voiceState.active ? 1 : 0));
    const voiceBarElement = (
      <VoiceBar
        voiceState={voiceState}
        isSpeaking={speakingMap.get('me') || false}
        activePeersCount={otherActivePeersCount}
        onJoin={handleJoinVoice}
        onLeave={handleLeaveVoice}
        onToggleMute={handleToggleVoiceMute}
        onToggleDeafen={handleToggleVoiceDeafen}
        t={t}
        isSupported={VoiceManager.isSupported()}
        busy={voiceBusy}
      />
    );

    body = (
      <Lobby
        view={view}
        t={t}
        busy={busy}
        onStart={startGame}
        onLeave={leaveRoom}
        onSetMaxPlayers={setMaxPlayers}
        onSetAvatar={setPlayerAvatar}
        onOpenRules={() => setShowRules(true)}
        speakingMap={speakingMap}
        voiceBar={voiceBarElement}
      />
    );
  } else if (inGame && view.game) {
    const myTurn = view.game.turnSeat !== null && view.game.turnSeat === view.you.seat;
    const activeVoiceCount = [...view.players, ...(view.spectators || [])].filter((p) => p.voice?.active).length;
    const otherActivePeersCount = Math.max(0, activeVoiceCount - (voiceState.active ? 1 : 0));
    const voiceBarElement = (
      <VoiceBar
        voiceState={voiceState}
        isSpeaking={speakingMap.get('me') || false}
        activePeersCount={otherActivePeersCount}
        onJoin={handleJoinVoice}
        onLeave={handleLeaveVoice}
        onToggleMute={handleToggleVoiceMute}
        onToggleDeafen={handleToggleVoiceDeafen}
        t={t}
        isSupported={VoiceManager.isSupported()}
        busy={voiceBusy}
      />
    );

    body = (
      <main className="game-container">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', flexWrap: 'wrap', gap: '8px' }}>
          <div className="lead-suit-pill">
            <span>{t('roomCode')}:</span>
            <b style={{ color: 'var(--gold)', letterSpacing: '1px' }}>{view.code}</b>
            <span style={{ opacity: 0.6 }}>·</span>
            <span>{t('round')} {view.game.round}</span>
          </div>

          <div className="row" style={{ gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {voiceBarElement}
            <button
              type="button"
              className="pill-btn"
              onClick={() => setShowRules(true)}
              title={t('howToPlay')}
            >
              📖 {t('howToPlay')}
            </button>
            <button
              type="button"
              className="pill-btn"
              onClick={leaveRoom}
              disabled={busy}
            >
              🚪 {t('leaveRoom')}
            </button>
          </div>
        </div>

        <Table view={view} t={t} speakingMap={speakingMap} />

        {view.you.isSpectator ? (
          <div className="spectator-hand-panel">
            <div className="row center" style={{ gap: '8px' }}>
              <span className="spectator-badge">👀 {t('spectating')}</span>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{t('spectatorBanner')}</span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '12px' }}>
              {view.game.turnSeat !== null ? t('turnOf', { name: view.players[view.game.turnSeat]?.name || '...' }) : ''}
            </p>
          </div>
        ) : (
          <Hand
            hand={view.game.hand}
            legal={view.game.legal}
            leadSuit={view.game.leadSuit}
            myTurn={myTurn}
            onPlay={playCard}
            onIllegal={() => setToast({ error: 'MUST_FOLLOW_SUIT' })}
            t={t}
          />
        )}

        {finished && showResult && view.game.result && (
          <ResultScreen view={view} t={t} busy={busy} onNewGame={newGame} onLeave={leaveRoom} />
        )}
      </main>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span
          className="brand"
          onClick={() => setShowWelcome(true)}
          title={t('replayIntro')}
          role="button"
          tabIndex={0}
        >
          <span className="brand-icon" aria-hidden="true">🂠</span>
          <span>{t('appName')}</span>
          {lang === 'en' && <span className="brand-odia">ଗଧା</span>}
        </span>

        <span className="topbar-actions">
          <button
            type="button"
            className="pill-btn"
            onClick={() => setShowWelcome(true)}
            title={t('replayIntro')}
          >
            ✨ {t('replayIntro')}
          </button>
          <span
            className={`conn-beacon ${conn === 'offline' ? 'offline' : ''}`}
            title={conn === 'online' ? 'Online' : 'Reconnecting...'}
          />
          <button
            type="button"
            className="pill-btn"
            onClick={cycleTheme}
            title={`${t('theme')}: ${theme === 'felt-classic' ? t('themeClassic') : theme === 'felt-crimson' ? t('themeCrimson') : t('themeMidnight')}`}
          >
            🎨 {theme === 'felt-classic' ? '🟢' : theme === 'felt-crimson' ? '🔴' : '🌌'}
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={() => setLang(lang === 'en' ? 'or' : 'en')}
          >
            🌐 {t('language')}
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? t('muted') : t('sound')}
            title={muted ? t('muted') : t('sound')}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </span>
      </header>

      {conn === 'offline' && !connecting && (
        <div className="banner" role="alert" style={{ background: '#a83226', color: '#fff', textAlign: 'center', padding: '6px' }}>
          {t('reconnecting')}
        </div>
      )}

      {body}

      {showRules && (
        <RulesModal t={t} onClose={() => setShowRules(false)} />
      )}

      {toastText && (
        <div className="toast" role="alert">
          {toastText}
        </div>
      )}

      {showWelcome && (
        <WelcomeAnimation
          t={t}
          lang={lang}
          onDismiss={() => setShowWelcome(false)}
        />
      )}
    </div>
  );
}
