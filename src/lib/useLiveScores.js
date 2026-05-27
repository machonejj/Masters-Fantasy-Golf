'use client';

import { useSyncExternalStore } from 'react';
import {
  subscribeLive,
  getLiveSnapshot,
  getLiveServerSnapshot,
  refreshLive,
} from '@/lib/liveStore';

// Reads the shared live-scores store: a name→competitor map (null until loaded),
// the projected cut line, last-update time, a status, and a manual refresh().
// Backed by one app-wide ESPN fetch, so it's instant on tab switches and never
// fetches more than once per cycle no matter how many components use it.
export function useLiveScores() {
  const s = useSyncExternalStore(subscribeLive, getLiveSnapshot, getLiveServerSnapshot);
  return { live: s.live, cut: s.cut, updatedAt: s.updatedAt, status: s.status, refresh: refreshLive };
}

// Overlays a golfer's stored round scores with the live feed (authoritative when
// the player is in the field), so golferTotal/teamData compute live standings.
export function mergeLive(golfer, liveMap) {
  const lv = liveMap?.[golfer.name.toLowerCase()];
  if (!lv) return golfer;
  const r = lv.rounds || [];
  return {
    ...golfer,
    r1: r[0] ?? null,
    r2: r[1] ?? null,
    r3: r[2] ?? null,
    r4: r[3] ?? null,
    status: lv.status ?? golfer.status,
    thru: lv.thru ?? golfer.thru,
    athleteId: lv.athleteId ?? golfer.athleteId ?? null,
  };
}
