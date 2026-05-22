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

// Codes are case-insensitive for the player; we normalize to the stored form.
export function normalizePlayerCode(code) {
  return (code || '').trim().toUpperCase();
}

// The hidden login email for a player code (e.g. "7qml2k@players.masters.pool").
export function playerEmail(code) {
  return `${normalizePlayerCode(code).toLowerCase()}@${PLAYER_EMAIL_DOMAIN}`;
}
