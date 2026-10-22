'use strict';
const { GadhaError } = require('./errors');

const MAX_NAME_LENGTH = 20; // characters (code points), so Odia names are not cut mid-letter
const CARD_ID_RE = /^(10|[2-9JQKA])[SHDC]$/;
const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;

/** Trim, collapse whitespace, strip control + bidi-override characters, enforce length. */
function cleanName(raw) {
  if (typeof raw !== 'string') throw new GadhaError('BAD_NAME', 'Name is required');
  const name = raw
    .replace(/[\p{Cc}‪-‮⁦-⁩]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const length = Array.from(name).length;
  if (length < 1 || length > MAX_NAME_LENGTH) {
    throw new GadhaError('BAD_NAME', `Name must be 1-${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

function cleanRoomCode(raw) {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!ROOM_CODE_RE.test(code)) throw new GadhaError('BAD_ROOM_CODE', 'Invalid room code');
  return code;
}

function cleanCardId(raw) {
  if (typeof raw !== 'string' || !CARD_ID_RE.test(raw)) throw new GadhaError('BAD_CARD', 'Invalid card');
  return raw;
}

function cleanCardIds(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 52) {
    throw new GadhaError('BAD_CARD', 'Invalid card selection');
  }
  return raw.map(cleanCardId);
}

function cleanToken(raw) {
  if (typeof raw !== 'string' || raw.length < 16 || raw.length > 128) {
    throw new GadhaError('BAD_TOKEN', 'Invalid session');
  }
  return raw;
}

function cleanMaxPlayers(raw, minAllowed = 2, maxAllowed = 8) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < minAllowed || n > maxAllowed) {
    throw new GadhaError('BAD_MAX_PLAYERS', `Player limit must be between ${minAllowed} and ${maxAllowed}`);
  }
  return n;
}

const ALLOWED_AVATARS = new Set(['🫏', '👑', '😎', '👳', '🐯', '🦚', '🦁', '🎴', '⚡', '💎', '🔥', '🦉']);
function cleanAvatar(raw) {
  if (typeof raw !== 'string') return '🫏';
  return ALLOWED_AVATARS.has(raw) ? raw : '🫏';
}

module.exports = {
  cleanName,
  cleanRoomCode,
  cleanCardId,
  cleanCardIds,
  cleanToken,
  cleanMaxPlayers,
  cleanAvatar,
  ALLOWED_AVATARS,
  MAX_NAME_LENGTH,
};
