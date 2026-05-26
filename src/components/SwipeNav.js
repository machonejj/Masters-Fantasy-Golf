'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { navTabs } from '@/lib/tabs';
import { setSwipeDir } from '@/lib/pageTransition';

const COMMIT_PX = 60; // horizontal travel needed to change tabs
const AXIS_LOCK_PX = 12; // movement before we decide horizontal vs. vertical
const FOLLOW = 0.45; // how much the page follows the finger (tactile hint)
const FOLLOW_MAX = 80; // cap the live nudge so the commit reset is invisible

// Wraps the page content and turns a horizontal drag on touch devices into
// prev/next tab navigation. Touch-only, so desktop is untouched. The live drag
// nudges the current page (the "slides off" half); the incoming page slides in
// via app/template.js to complete the paging motion.
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
      e.preventDefault(); // we own this horizontal gesture
      d.dx = dx;
      // Resist when there's no tab that way (rubber-band at the ends).
      const atEdge = (dx < 0 && !nextHref) || (dx > 0 && !prevHref);
      let eff = dx * FOLLOW * (atEdge ? 0.35 : 1);
      eff = Math.max(-FOLLOW_MAX, Math.min(FOLLOW_MAX, eff));
      setX(eff, false);
    };

    const onEnd = () => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      if (d.axis !== 'x') return;
      const target = d.dx <= -COMMIT_PX ? nextHref : d.dx >= COMMIT_PX ? prevHref : null;
      if (target) {
        // Clear the live nudge instantly (no visible snap — the cap is small),
        // tell the template which way to slide, then navigate.
        setX(0, false);
        setSwipeDir(d.dx < 0 ? 1 : -1, target);
        router.push(target);
      } else {
        setX(0, true); // didn't cross the threshold → spring back
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [pathname, isAdmin, router]);

  return (
    <div ref={ref} style={{ touchAction: 'pan-y' }}>
      {children}
    </div>
  );
}
