// A tiny cross-module signal between the swipe handler and the route template.
// When a swipe triggers navigation it records which direction + which target
// path; the template reads it (purely, no mutation) on mount and slides the
// incoming page in to match. A short time window means a later *click* to the
// same path won't accidentally replay the slide — so only swipes animate.

let sig = { dir: 0, path: null, t: 0 };

// dir: 1 = forward (new page enters from the right), -1 = back (from the left).
export function setSwipeDir(dir, path) {
  sig = { dir, path, t: Date.now() };
}

// Returns the slide direction for `path` if a swipe set it within the last
// moment, else 0. Pure read — safe to call during render.
export function readSwipeDir(path) {
  if (sig.path === path && Date.now() - sig.t < 1500) return sig.dir;
  return 0;
}
