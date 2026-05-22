'use client';

import { useEffect, useState } from 'react';

// Polls the live ESPN feed and returns a name→competitor map (null until loaded)
// plus the last update time. Lets pages show live standings without anyone
// having to hit "Pull live scores" — the data refreshes itself on an interval.
export function useLiveScores(pollMs = 60000) {
  const [live, setLive] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/golfers/live');
        const data = await res.json();
        if (!res.ok || !alive) return;
        const map = {};
        for (const c of data.competitors || []) map[c.name.toLowerCase()] = c;
        setLive(map);
        setUpdatedAt(data.updatedAt || new Date().toISOString());
      } catch {
        /* keep the last good data on a blip */
      }
    };
    load();
    const t = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return { live, updatedAt };
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
  };
}
