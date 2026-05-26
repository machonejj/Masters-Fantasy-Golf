'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createClient } from '@/lib/supabase/client';
import { navTabs } from '@/lib/tabs';
import {
  subscribeSwipeProgress,
  getSwipeProgress,
  clearSwipeProgress,
  INITIAL,
} from '@/lib/swipeProgress';

export default function NavBar({ profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const tabs = navTabs(profile?.is_admin);

  // Watch the draft status so the Draft Room tab can pulse "live" while a draft
  // is running. Updates over realtime (draft_state is in the publication).
  const [draftStatus, setDraftStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    const fetchStatus = async () => {
      const { data } = await supabase.from('draft_state').select('status').eq('id', 1).maybeSingle();
      if (alive) setDraftStatus(data?.status ?? null);
    };
    fetchStatus();
    const ch = supabase
      .channel('nav-draft-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_state' }, fetchStatus)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [supabase]);
  const draftLive = draftStatus === 'active';

  // Which tab the URL says we're on.
  const activeIndex =
    pathname === '/'
      ? 0
      : Math.max(
          0,
          tabs.findIndex((t) => t.href !== '/' && pathname.startsWith(t.href))
        );

  // During a swipe, the highlight rides between tabs; otherwise it sits on the
  // active one. Clear the live progress once a navigation lands.
  const swipe = useSyncExternalStore(subscribeSwipeProgress, getSwipeProgress, () => INITIAL);
  const effIndex = swipe.active ? swipe.from + (swipe.to - swipe.from) * swipe.progress : activeIndex;
  useEffect(() => {
    clearSwipeProgress();
  }, [pathname]);

  async function signOut() {
    try {
      localStorage.removeItem('poolCode'); // forget the remembered code on a real sign-out
    } catch {}
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="bg-masters-green sticky top-0 z-50">
      <div className="max-w-5xl mx-auto">
        {/* Brand + account */}
        <div className="flex items-center justify-between px-4 h-12">
          <Link href="/" className="flex items-center gap-2 text-white whitespace-nowrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/augusta-mark.png" alt="Augusta Pickem" className="h-7 w-auto" />
            <span className="font-masters text-base font-bold tracking-wide leading-none">
              Augusta Pickem
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-white/70">
              {profile?.display_name}
            </span>
            <button
              onClick={signOut}
              className="text-xs border border-white/20 text-white/70 px-2.5 py-1 rounded hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Tabs — evenly fill the width so they fit any screen. A single
            underline slides between tabs (and rides the swipe live). */}
        <div className="relative flex border-t border-white/10">
          {tabs.map((t, i) => {
            // 1 when the highlight is fully on this tab, fading to 0 a tab away —
            // so the "white" crossfades from one tab to the next during a swipe.
            const intensity = Math.max(0, 1 - Math.abs(i - effIndex));
            return (
              <Link
                key={t.href}
                href={t.href}
                className="flex-1 text-center py-2.5 text-[11px] sm:text-sm whitespace-nowrap"
                style={{
                  color: `rgba(255,255,255,${(0.65 + 0.35 * intensity).toFixed(3)})`,
                  fontWeight: intensity > 0.5 ? 700 : 500,
                }}
              >
                {t.label}
                {t.href === '/draft' && draftLive && (
                  <span
                    className="ml-1.5 inline-flex items-center gap-1 align-middle text-[9px] font-bold uppercase tracking-wide text-red-500"
                    title="Draft live"
                  >
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="hidden sm:inline">Live</span>
                  </span>
                )}
              </Link>
            );
          })}
          <span
            aria-hidden
            className="absolute bottom-0 left-0 h-[3px] bg-white rounded-full"
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${effIndex * 100}%)`,
              transition: 'transform 0.2s ease-out',
            }}
          />
        </div>
      </div>
    </nav>
  );
}
