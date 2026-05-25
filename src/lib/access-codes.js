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

// ── Admin codes ────────────────────────────────────────────────────────────
// ADMIN_ACCESS_CODE is comma-separated to allow several admins (e.g. "TOMMY,JAKE").
// Each code maps to its OWN hidden admin account, so multiple admins can be
// signed in at the same time.
export const ADMIN_EMAIL_DOMAIN = 'admins.masters.pool';

const normAdmin = (code) => (code || '').trim().toUpperCase();

export function adminCodes() {
  return (process.env.ADMIN_ACCESS_CODE || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

// The configured admin code matching a typed code (case-insensitive), or null.
export function matchAdminCode(typed) {
  const t = normAdmin(typed);
  return adminCodes().find((c) => normAdmin(c) === t) || null;
}

// Hidden login email for an admin code, e.g. "jake@admins.masters.pool".
export function adminEmail(code) {
  const slug = normAdmin(code).toLowerCase().replace(/[^a-z0-9]/g, '') || 'admin';
  return `${slug}@${ADMIN_EMAIL_DOMAIN}`;
}

// Deterministic password ≥6 chars, so short codes like "JAKE" still satisfy
// Supabase's minimum password length.
export function adminPassword(code) {
  return `${normAdmin(code)}-augusta-admin`;
}

// Friendly display name, e.g. "JAKE" → "Jake".
export function adminDisplayName(code) {
  const c = normAdmin(code);
  return c ? c.charAt(0) + c.slice(1).toLowerCase() : 'Admin';
}
