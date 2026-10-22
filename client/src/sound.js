import gadhaUrl from './assets/gadha.mp3';
import { GADHA_AUDIO_DATA_URI } from './assets/gadhaAudioBase64.js';

// Sound effects engine: plays custom audio files (e.g. gadha.mp3) with Web Audio synthesized fallbacks.
let ctx = null;
let muted = false;
let currentAudio = null;
let decodedGadhaBuffer = null;

try {
  muted = localStorage.getItem('gadha.muted') === '1';
} catch {
  /* storage unavailable */
}

function audio() {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Pre-decode audio buffer for immediate WebAudio playback if available
async function ensureGadhaBuffer() {
  if (decodedGadhaBuffer) return decodedGadhaBuffer;
  const c = audio();
  if (!c) return null;
  try {
    const res = await fetch(GADHA_AUDIO_DATA_URI);
    const ab = await res.arrayBuffer();
    decodedGadhaBuffer = await c.decodeAudioData(ab);
    return decodedGadhaBuffer;
  } catch (e) {
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => ensureGadhaBuffer(), { once: true });
  window.addEventListener('keydown', () => ensureGadhaBuffer(), { once: true });
}

function tone(freq, start, dur, { type = 'sine', gain = 0.15, slideTo } = {}) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function stopCurrentAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
}

export function isAudioPlaying() {
  return !!(currentAudio && !currentAudio.paused && !currentAudio.ended);
}

export function playAudio(urls, { volume = 1.0, fallback } = {}) {
  if (muted) return null;
  stopCurrentAudio();

  const list = Array.isArray(urls) ? urls : [urls];
  let idx = 0;

  function tryNext() {
    if (idx >= list.length) {
      if (fallback) fallback();
      return;
    }
    const src = list[idx++];
    try {
      const audioEl = new Audio(src);
      audioEl.volume = volume;
      audioEl.preload = 'auto';
      currentAudio = audioEl;

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[sound] audio play failed, trying next:', err);
          if (currentAudio === audioEl) currentAudio = null;
          tryNext();
        });
      }

      audioEl.addEventListener('error', (e) => {
        console.warn('[sound] audio error event, trying next:', e);
        if (currentAudio === audioEl) currentAudio = null;
        tryNext();
      }, { once: true });

      audioEl.addEventListener('ended', () => {
        if (currentAudio === audioEl) currentAudio = null;
      }, { once: true });
    } catch (err) {
      console.warn('[sound] error creating audio element:', err);
      tryNext();
    }
  }

  tryNext();
  return currentAudio;
}

const GADHA_AUDIO_SOURCES = [
  gadhaUrl,
  GADHA_AUDIO_DATA_URI,
  '/sounds/gadha.mp3',
  '/sounds/gadha-audio.mp3',
  '/sounds/gadha%20audio.mp3',
  '/gadha%20audio.mp3',
];

export const sounds = {
  click() { tone(800, 0, 0.03, { type: 'sine', gain: 0.08 }); },
  select() { tone(580, 0, 0.04, { type: 'sine', gain: 0.1 }); },
  play() {
    tone(420, 0, 0.04, { type: 'triangle', gain: 0.22, slideTo: 180 });
    tone(840, 0.01, 0.03, { type: 'sine', gain: 0.1 });
  },
  turn() {
    tone(523.25, 0, 0.12, { type: 'sine', gain: 0.16 });
    tone(659.25, 0.08, 0.16, { type: 'sine', gain: 0.18 });
  },
  cut() {
    // Dramatic cut / thulla sound: heavy dual sawtooth hit
    tone(180, 0, 0.25, { type: 'sawtooth', gain: 0.25, slideTo: 90 });
    tone(270, 0.02, 0.22, { type: 'triangle', gain: 0.2, slideTo: 135 });
  },
  collect() {
    tone(440, 0, 0.08, { type: 'triangle', gain: 0.14, slideTo: 660 });
    tone(660, 0.05, 0.12, { type: 'sine', gain: 0.12 });
  },
  win(customSrc) {
    const list = customSrc ? [customSrc] : ['/sounds/victory.mp3', '/sounds/win.mp3'];
    playAudio(list, {
      volume: 0.85,
      fallback: () => sounds.synthWin(),
    });
  },
  synthWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, i * 0.1, 0.28, { type: 'triangle', gain: 0.18 })
    );
  },
  gadha(customSrc) {
    if (muted) return;

    // Fast path: Web Audio buffer if already decoded
    const c = audio();
    if (!customSrc && c && decodedGadhaBuffer) {
      try {
        stopCurrentAudio();
        const srcNode = c.createBufferSource();
        srcNode.buffer = decodedGadhaBuffer;
        const gainNode = c.createGain();
        gainNode.gain.value = 1.0;
        srcNode.connect(gainNode).connect(c.destination);
        srcNode.start(0);
        return;
      } catch (err) {
        console.warn('[sound] buffer playback failed, falling back to Audio:', err);
      }
    }

    const list = customSrc ? (Array.isArray(customSrc) ? customSrc : [customSrc]) : GADHA_AUDIO_SOURCES;
    playAudio(list, {
      volume: 1.0,
      fallback: () => sounds.synthLose(),
    });
  },
  lose() {
    sounds.gadha();
  },
  synthLose() {
    // Playful sad trombone (wa-wa-wa-waaa)
    [311.13, 293.66, 277.18, 261.63].forEach((f, i) =>
      tone(f, i * 0.2, 0.35, { type: 'sawtooth', gain: 0.12, slideTo: f * 0.95 })
    );
  },
  error() { tone(160, 0, 0.15, { type: 'square', gain: 0.08 }); },
  welcome() {
    // Rich royal fanfare arpeggio: C4, E4, G4, C5, E5, with a gentle shimmering decay
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
    notes.forEach((f, i) => {
      tone(f, i * 0.11, 0.4, { type: 'triangle', gain: 0.14 });
      tone(f * 2, i * 0.11 + 0.02, 0.25, { type: 'sine', gain: 0.05 });
    });
  },
};

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (muted) {
    stopCurrentAudio();
  }
  try {
    localStorage.setItem('gadha.muted', value ? '1' : '0');
  } catch {
    /* ignore */
  }
}
