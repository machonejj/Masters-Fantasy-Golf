'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { navTabs } from '@/lib/tabs';
import { setSwipeProgress, clearSwipeProgress } from '@/lib/swipeProgress';

const COMMIT_PX = 60; // horizontal travel needed to change tabs
const AXIS_LOCK_PX = 12; // movement before we decide horizontal vs. vertical
const PROGRESS_FRACTION = 0.35; // swipe this fraction of the screen = highlight fully moved

// Turns a horizontal drag anywhere on the screen into prev/next tab navigation.
// Listeners live on `window` so the whole viewport is swipeable (not just the
// content box). Touch-only, so desktop is untouched. The drag slides the nav
// highlight live; on release it just navigates (no page-content animation —
// that proved glitchy). Adjacent tabs are prefetched so the switch is instant.
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

    // Preload the adjacent tabs so the swipe navigation is instant — the
    // incoming page is ready the moment we push, so it slides in locked to the
    // outgoing snapshot instead of lagging behind it.
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);

    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      const d = drag.current;
      d.x0 = e.touches[0].clientX;
      d.y0 = e.touches[0].clientY;
      d.dx = 0;
      d.axis = null;
      d.active = true;
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

      // Only the nav highlight tracks the finger; the page itself stays put and
      // then does a single clean cross-slide on release (no nudge to snap back).
      const targetIdx = dx < 0 ? (nextHref ? idx + 1 : idx) : prevHref ? idx - 1 : idx;
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
        const targetIdx = d.dx < 0 ? idx + 1 : idx - 1;
        // Just navigate — no page-content animation (only the nav highlight
        // slides). Hold the highlight on the destination until the route catches
        // up, so it doesn't snap back; NavBar clears it once the pathname updates.
        setSwipeProgress({ active: true, from: targetIdx, to: targetIdx, progress: 0 });
        router.push(target);
      } else {
        clearSwipeProgress(); // didn't cross the threshold
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
