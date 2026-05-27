'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { navTabs } from '@/lib/tabs';
import { setSwipeDir } from '@/lib/pageTransition';
import { setSwipeProgress, clearSwipeProgress } from '@/lib/swipeProgress';

const COMMIT_PX = 60; // horizontal travel needed to change tabs
const AXIS_LOCK_PX = 12; // movement before we decide horizontal vs. vertical
const FOLLOW = 0.45; // how much the page follows the finger (tactile hint)
const FOLLOW_MAX = 80; // cap the live nudge so the commit reset is invisible
const PROGRESS_FRACTION = 0.35; // swipe this fraction of the screen = highlight fully moved

// On commit, freeze a snapshot of the page you're leaving into a fixed overlay
// and slide it off — while the incoming page slides in from the other side via
// app/template.js. So you briefly see BOTH screens cross. `dir`: 1 = forward
// (old exits left), -1 = back (old exits right).
function spawnExitOverlay(el, dir) {
  if (typeof document === 'undefined' || !el) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const rect = el.getBoundingClientRect();
  const clip = document.createElement('div');
  clip.style.cssText =
    'position:fixed;inset:0;overflow:hidden;z-index:40;pointer-events:none;';
  const slider = document.createElement('div');
  slider.style.cssText = `position:absolute;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;will-change:transform;transition:transform .3s cubic-bezier(.22,.61,.36,1);`;
  const clone = el.cloneNode(true);
  clone.style.transform = 'none';
  // Strip any leftover enter-animation classes so the clone doesn't re-animate.
  clone.querySelectorAll?.('.page-in-right,.page-in-left').forEach((n) =>
    n.classList.remove('page-in-right', 'page-in-left')
  );
  slider.appendChild(clone);
  clip.appendChild(slider);
  document.body.appendChild(clip);
  requestAnimationFrame(() => {
    slider.style.transform = `translateX(${dir === 1 ? '-100%' : '100%'})`;
  });
  setTimeout(() => clip.remove(), 340);
}

// Turns a horizontal drag anywhere on the screen into prev/next tab navigation.
// Listeners live on `window` so the whole viewport is swipeable (not just the
// content box). Touch-only, so desktop is untouched. The drag nudges the page
// and slides the nav highlight live; the incoming page slides in via template.js.
export default function SwipeNav({ isAdmin, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef(null);
  const drag = useRef({ x0: 0, y0: 0, dx: 0, axis: null, active: false });

  useEffect(() => {
    const tabs = navTabs(isAdmin).map((t) => t.href);
    const idx = pathname === '/' ? 0 : tabs.findIndex((h) => h !== '/' && pathname.startsWith(h));
    const el = ref.current;
    if (!el || idx === -1) return; // not a tab page → no swipe

    const prevHref = idx > 0 ? tabs[idx - 1] : null;
    const nextHref = idx < tabs.length - 1 ? tabs[idx + 1] : null;

    const setX = (x, animate) => {
      el.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
      el.style.transform = x ? `translateX(${x}px)` : 'none';
    };

    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      const d = drag.current;
      d.x0 = e.touches[0].clientX;
      d.y0 = e.touches[0].clientY;
      d.dx = 0;
      d.axis = null;
      d.active = true;
      setX(0, false);
    };

    const onMove = (e) => {
      const d = drag.current;
      if (!d.active) return;
      const dx = e.touches[0].clientX - d.x0;
      const dy = e.touches[0].clientY - d.y0;
      if (!d.axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (d.axis !== 'x') return; // vertical drag → let the page scroll
      if (e.cancelable) e.preventDefault(); // we own this horizontal gesture
      d.dx = dx;

      // Which tab are we heading toward? (Stay put at the ends.)
      const targetIdx = dx < 0 ? (nextHref ? idx + 1 : idx) : prevHref ? idx - 1 : idx;
      const atEdge = targetIdx === idx;

      // Nudge the page with the finger (rubber-band at the ends).
      let eff = dx * FOLLOW * (atEdge ? 0.35 : 1);
      eff = Math.max(-FOLLOW_MAX, Math.min(FOLLOW_MAX, eff));
      setX(eff, false);

      // Slide the nav highlight toward the target tab.
      const progress = Math.min(Math.abs(dx) / (window.innerWidth * PROGRESS_FRACTION), 1);
      setSwipeProgress({ active: true, from: idx, to: targetIdx, progress });
    };

    const onEnd = () => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      if (d.axis !== 'x') return;
      const target = d.dx <= -COMMIT_PX ? nextHref : d.dx >= COMMIT_PX ? prevHref : null;
      if (target) {
        const dir = d.dx < 0 ? 1 : -1;
        const targetIdx = idx + dir;
        // Freeze the outgoing screen and slide it off as the new one slides in.
        spawnExitOverlay(el, dir);
        setX(0, false); // clear the small finger nudge (the snapshot now shows the old page)
        // Hold the highlight on the destination until the route catches up, so it
        // doesn't snap back; NavBar clears it once the pathname updates.
        setSwipeProgress({ active: true, from: targetIdx, to: targetIdx, progress: 0 });
        setSwipeDir(dir, target);
        router.push(target);
      } else {
        setX(0, true); // didn't cross the threshold → spring back
        clearSwipeProgress();
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [pathname, isAdmin, router]);

  return (
    <div ref={ref} style={{ touchAction: 'pan-y' }}>
      {children}
    </div>
  );
}
