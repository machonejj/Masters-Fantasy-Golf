import { randomInt } from 'crypto';

// Shared helpers for the code-based login system. SERVER-ONLY — only import
// from API route handlers (never a client component).
//
// Every account in the pool is a real (hidden) Supabase user. A player's typed
// code maps deterministically to that user's login: the code IS the password,
// and the email is derived from it. The admin code is a separate server secret
// (ADMIN_ACCESS_CODE) tied to a single admin account.

// Unambiguous uppercase alphabet — no 0/O/1/I — so codes are easy to read aloud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const PLAYER_EMAIL_DOMAIN = 'players.masters.pool';
export const ADMIN_EMAIL = 'admin@masters.pool';

export function generateCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

// A short, memorable player code: first initial + last initial + a digit 1–9
// (e.g. "Jake M" → "JM5"). Easy for a player to recall / re-enter if they get
// logged out. Pass extraDigit=true for a 2-digit fallback when initials collide.
export function codeFromName(name, extraDigit = false) {
  const words = (name || '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let initials;
  if (words.length >= 2) {
    initials = words[0][0] + words[words.length - 1][0];
  } else if (words.length === 1) {
    initials = (words[0][0] || 'X') + (words[0][1] || words[0][0] || 'X');
  } else {
    initials = 'XX';
  }
  return initials + randomInt(1, 10) + (extraDigit ? String(randomInt(0, 10)) : '');
}

// Codes are case-insensitive for the player; we normalize to the stored form.
export function normalizePlayerCode(code) {
  return (code || '').trim().toUpperCase();
}

// The hidden login email for a player code (e.g. "7qml2k@players.masters.pool").
export function playerEmail(code) {
  return `${normalizePlayerCode(code).toLowerCase()}@${PLAYER_EMAIL_DOMAIN}`;
}
