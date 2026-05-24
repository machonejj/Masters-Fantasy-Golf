'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Polls the live ESPN feed and returns a name→competitor map (null until loaded),
// the last update time, a status, and a manual refresh(). Pages get live data on
// an interval and can also offer a "↻ Live" button via the shared LiveStatus.
export function useLiveScores(pollMs = 60000) {
  const [live, setLive] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/golfers/live');
      const data = await res.json();
      if (!aliveRef.current) return;
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const map = {};
      for (const c of data.competitors || []) map[c.name.toLowerCase()] = c;
      setLive(map);
      setUpdatedAt(data.updatedAt || new Date().toISOString());
      setStatus('ok');
    } catch {
      if (aliveRef.current) setStatus('error'); // keep the last good data on a blip
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => {
      aliveRef.current = false;
      clearInterval(t);
    };
  }, [pollMs, refresh]);

  return { live, updatedAt, status, refresh };
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
