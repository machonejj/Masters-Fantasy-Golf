'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { Loading, PageHeader } from '@/app/page';
import { golferTotal, scoreText, scoreColor } from '@/lib/scoring';

export default function GolfersPage() {
  const { loading, settings, golfers, picks, participants } = usePoolData();
  const [live, setLive] = useState({ rows: {}, status: 'idle', updatedAt: null });
  const [filter, setFilter] = useState('all'); // all | drafted | available
  const [search, setSearch] = useState('');

  const opts = settings
    ? { coursePar: settings.course_par, cutPenalty: settings.cut_penalty }
    : {};

  async function loadLive() {
    setLive((l) => ({ ...l, status: 'loading' }));
    try {
      const res = await fetch('/api/golfers/live');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      const map = {};
      for (const c of data.competitors || []) {
        map[c.name.toLowerCase()] = c;
      }
      setLive({ rows: map, status: 'ok', updatedAt: data.updatedAt });
    } catch {
      setLive((l) => ({ ...l, status: 'error' }));
    }
  }

  // Auto-load live scores on mount, then refresh every 60s.
  useEffect(() => {
    loadLive();
    const t = setInterval(loadLive, 60000);
    return () => clearInterval(t);
  }, []);

  const ownerByGolfer = useMemo(() => {
    const m = {};
    for (const pk of picks) {
      const part = participants.find((p) => p.id === pk.participant_id);
      if (part) m[pk.golfer_id] = part.display_name;
    }
    return m;
  }, [picks, participants]);

  const rows = useMemo(() => {
    return golfers
      .filter((g) => {
        if (filter === 'drafted') return ownerByGolfer[g.id];
        if (filter === 'available') return !ownerByGolfer[g.id];
        return true;
      })
      .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
      .map((g) => ({
        g,
        total: golferTotal(g, opts),
        live: live.rows[g.name.toLowerCase()],
      }))
      .sort((a, b) => (a.total ?? 999) - (b.total ?? 999) || (a.g.rank ?? 999) - (b.g.rank ?? 999));
  }, [golfers, filter, search, ownerByGolfer, live, settings]);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Golfers"
        subtitle={settings?.tournament_name}
        action={
          <div className="text-right">
            <button onClick={loadLive} className="btn-outline btn-sm">
              {live.status === 'loading' ? 'Refreshing…' : '↻ Live scores'}
            </button>
            {live.status === 'ok' && live.updatedAt && (
              <div className="text-[10px] text-gray-400 mt-1">
                ESPN · {new Date(live.updatedAt).toLocaleTimeString()}
              </div>
            )}
            {live.status === 'error' && (
              <div className="text-[10px] text-score-over mt-1">live feed unavailable</div>
            )}
          </div>
        }
      />

      <div className="flex gap-2 mb-4">
        {['all', 'drafted', 'available'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn-sm rounded-lg capitalize ${
              filter === f ? 'btn-primary' : 'btn-outline'
            }`}
          >
            {f}
          </button>
        ))}
        <input
          className="input !py-1.5 ml-auto max-w-[180px]"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-masters-green-pale text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 font-semibold">Golfer</th>
              <th className="px-2 py-2 font-semibold text-center">Live</th>
              <th className="px-2 py-2 font-semibold text-center">Thru</th>
              <th className="px-3 py-2 font-semibold text-right">Total</th>
              <th className="px-3 py-2 font-semibold hidden sm:table-cell">Drafted by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ g, total, live: lv }) => (
              <tr key={g.id} className="border-t border-masters-green-light/60">
                <td className="px-3 py-2">
                  <span className="text-xs text-gray-400 mr-1.5">#{g.rank ?? '–'}</span>
                  <span className={g.status !== 'active' ? 'text-gray-400' : 'font-medium'}>
                    {g.name}
                  </span>
                  {g.status === 'cut' && <span className="chip bg-red-100 text-red-700 ml-2">CUT</span>}
                  {g.status === 'wd' && <span className="chip bg-red-100 text-red-700 ml-2">WD</span>}
                </td>
                <td className={`px-2 py-2 text-center font-semibold ${scoreColor(parseLive(lv?.score))}`}>
                  {lv?.score ?? '—'}
                </td>
                <td className="px-2 py-2 text-center text-xs text-gray-500">{lv?.thru ?? '—'}</td>
                <td className={`px-3 py-2 text-right font-serif font-bold ${scoreColor(total)}`}>
                  {scoreText(total)}
                </td>
                <td className="px-3 py-2 hidden sm:table-cell text-gray-500 text-xs">
                  {ownerByGolfer[g.id] || <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-6">
                  No golfers. The admin can load the field from the Admin panel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseLive(score) {
  if (!score || score === 'E') return 0;
  const n = parseInt(String(score).replace('+', ''), 10);
  return Number.isNaN(n) ? null : n;
}
