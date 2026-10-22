// Tiny synthesized sound effects (Web Audio) - no audio files to download.
let ctx = null;
let muted = false;
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
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, i * 0.1, 0.28, { type: 'triangle', gain: 0.18 })
    );
  },
  lose() {
    // Playful sad trombone (wa-wa-wa-waaa)
    [311.13, 293.66, 277.18, 261.63].forEach((f, i) =>
      tone(f, i * 0.2, 0.35, { type: 'sawtooth', gain: 0.12, slideTo: f * 0.95 })
    );
  },
  error() { tone(160, 0, 0.15, { type: 'square', gain: 0.08 }); },
};

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem('gadha.muted', value ? '1' : '0');
  } catch {
    /* ignore */
  }
}
