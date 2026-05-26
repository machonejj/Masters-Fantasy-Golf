// Live swipe progress, shared from the SwipeNav gesture to the NavBar so the
// active-tab highlight can slide toward the target tab as the finger moves.
//   active:   a horizontal swipe is in progress
//   from/to:  tab indices the swipe is moving between
//   progress: 0 → 1 along that move
// A simple external store so NavBar can subscribe via useSyncExternalStore.

export const INITIAL = { active: false, from: 0, to: 0, progress: 0 };

let state = INITIAL;
const listeners = new Set();

export function setSwipeProgress(next) {
  state = next;
  for (const l of listeners) l();
}

export function clearSwipeProgress() {
  if (state === INITIAL) return; // already idle — skip a needless re-render
  setSwipeProgress(INITIAL);
}

export function getSwipeProgress() {
  return state;
}

export function subscribeSwipeProgress(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
