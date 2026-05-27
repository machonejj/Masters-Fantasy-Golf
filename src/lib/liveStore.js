// Shared, app-wide live-scores store (singleton). One fetch of the ESPN feed,
// cached and shared across every tab that shows live data (standings, the field,
// the draft, admin) — instead of each page (and each component) fetching its own
// copy on mount. Refreshes on a visibility-gated 60s poll; deduped.

const INITIAL = { live: null, cut: null, updatedAt: null, status: 'loading' };

let state = INITIAL;
const listeners = new Set();
let started = false;
let inflight = null;
let pollTimer = null;

const POLL_MS = 60000;

function emit() {
  for (const l of listeners) l();
}

export function getLiveSnapshot() {
  return state;
}
export function getLiveServerSnapshot() {
  return INITIAL;
}

export async function refreshLive() {
  if (inflight) return inflight;
  // Only show a "loading" status on the very first fetch; later refreshes
  // revalidate silently so the ↻ Live indicator doesn't flicker every minute.
  if (!state.live) {
    state = { ...state, status: 'loading' };
    emit();
  }
  inflight = (async () => {
    try {
      const res = await fetch('/api/golfers/live');
      const data = await res.json();
      if (!res.ok) {
        state = { ...state, status: 'error' };
        emit();
        return;
      }
      const map = {};
      for (const c of data.competitors || []) map[c.name.toLowerCase()] = c;
      state = {
        live: map,
        cut: data.cut ?? null,
        updatedAt: data.updatedAt || new Date().toISOString(),
        status: 'ok',
      };
      emit();
    } catch {
      state = { ...state, status: 'error' }; // keep the last good data on a blip
      emit();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function onVisible() {
  if (document.visibilityState === 'visible') refreshLive();
}

function start() {
  refreshLive();
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshLive();
  }, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
}

export function subscribeLive(cb) {
  listeners.add(cb);
  if (!started) {
    started = true;
    start();
  }
  return () => listeners.delete(cb);
}
