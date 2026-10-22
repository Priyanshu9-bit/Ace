import { io } from 'socket.io-client';

// Same-origin by default (production server serves the client; dev uses the Vite proxy).
// Set VITE_SERVER_URL at build time if the server lives on a different domain.
const url = import.meta.env.VITE_SERVER_URL || undefined;

export const socket = io(url, {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

/** Promise wrapper around an acked emit, with a timeout so the UI never hangs. */
export function request(event, payload = {}, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: { code: 'NETWORK' } });
      return;
    }
    const timer = setTimeout(() => resolve({ ok: false, error: { code: 'NETWORK' } }), timeoutMs);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res && typeof res === 'object' ? res : { ok: false, error: { code: 'INTERNAL' } });
    });
  });
}

const KEY = 'gadha.session';

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.code && s.token ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
