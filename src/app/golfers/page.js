'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { Loading, PageHeader } from '@/app/page';
import { adjustedTotal, scoreText, scoreColor, liveRoundIndex } from '@/lib/scoring';
import { teamColor } from '@/lib/teamColors';
import PlayerScorecard from '@/components/PlayerScorecard';
import LiveStatus from '@/components/LiveStatus';

const FILTERS = ['all', 'drafted'];

export default function FieldPage() {
  const { loading, settings, golfers, picks, participants } = usePoolData();
  const [live, setLive] = useState({ rows: {}, status: 'idle', updatedAt: null, cut: null });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // { name, owner, athleteId, teamSeed }
  const [sort, setSort] = useState({ key: 'total', dir: 'asc' }); // asc = best (lowest) first

  // Click a column to sort by it; click again to flip direction.
  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  const caret = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const opts = settings ? { coursePar: settings.course_par } : {};

  async function loadLive() {
    setLive((l) => ({ ...l, status: 'loading' }));
    try {
      const res = await fetch('/api/golfers/live');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      const map = {};
      for (const c of data.competitors || []) map[c.name.toLowerCase()] = c;
      setLive({ rows: map, status: 'ok', updatedAt: data.updatedAt, cut: data.cut ?? null });
    } catch {
      setLive((l) => ({ ...l, status: 'error' }));
    }
  }

  useEffect(() => {
    loadLive();
    const t = setInterval(loadLive, 60000);
    return () => clearInterval(t);
  }, []);

  // golferId → owning team { name, seed } for the color coding.
  const ownerByGolfer = useMemo(() => {
    const m = {};
    for (const pk of picks) {
      const part = participants.find((p) => p.id === pk.participant_id);
      if (part) m[pk.golfer_id] = { name: part.display_name, seed: part.draft_position };
    }
    return m;
  }, [picks, participants]);

  // Merge each golfer with live scores (live wins when the player is in the field).
  const merged = useMemo(
    () =>
      golfers.map((g) => {
        const lv = live.rows[g.name.toLowerCase()];
        const rounds = lv?.rounds ?? [g.r1, g.r2, g.r3, g.r4];
        const status = lv?.status ?? g.status;
        // Use the penalty-adjusted total so cut golfers carry +8 per missed
        // round (ESPN's live total is just their real to-par through the cut).
        const total = adjustedTotal(rounds, status, opts);
        return {
          g,
          athleteId: lv?.athleteId ?? null,
          owner: ownerByGolfer[g.id] || null,
          rounds,
          total,
          thru: lv?.thru ?? g.thru ?? '—',
          status,
        };
      }),
    [golfers, live, ownerByGolfer, opts]
  );

  // Golf-style leaderboard position by total, with ties → 1, T2, T2, 4 …
  const positionByGolfer = useMemo(() => {
    const scored = merged
      .filter((r) => r.total !== null && r.status !== 'cut' && r.status !== 'wd')
      .sort((a, b) => a.total - b.total);
    const m = {};
    let i = 0;
    while (i < scored.length) {
      let j = i;
      while (j < scored.length && scored[j].total === scored[i].total) j++;
      const label = (j - i > 1 ? 'T' : '') + (i + 1); // T-prefix when tied
      for (let k = i; k < j; k++) m[scored[k].g.id] = label;
      i = j;
    }
    return m;
  }, [merged]);

  const rows = useMemo(() => {
    const filtered = merged.filter((r) => {
      if (!r.g.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'drafted') return !!r.owner;
      return true;
    });

    const val = (row) => {
      switch (sort.key) {
        case 'name':
          return row.g.name.toLowerCase();
        case 'thru': {
          const t = String(row.thru);
          if (/^\d+$/.test(t)) return Number(t);
          return t === 'F' ? 18 : null;
        }
        case 'r1':
          return row.rounds?.[0];
        case 'r2':
          return row.rounds?.[1];
        case 'r3':
          return row.rounds?.[2];
        case 'r4':
          return row.rounds?.[3];
        default:
          return row.total; // total / pos
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;

    return filtered.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (sort.key === 'name') return String(av).localeCompare(String(bv)) * dir;
      // Players without a value for this column always sort to the bottom.
      const an = av === null || av === undefined || Number.isNaN(av);
      const bn = bv === null || bv === undefined || Number.isNaN(bv);
      if (an && bn) return (a.total ?? 999) - (b.total ?? 999);
      if (an) return 1;
      if (bn) return -1;
      if (av !== bv) return (av - bv) * dir;
      // Tie-break by total, then name.
      return (a.total ?? 999) - (b.total ?? 999) || a.g.name.localeCompare(b.g.name);
    });
  }, [merged, filter, search, sort]);

  if (loading) return <Loading />;

  // The cut happens once, after R2. While R1–R2 are underway it's a projection
  // (from ESPN). Once it's been made — any golfer is cut, or R3 scoring has begun
  // — it's final and already baked into the board via cut status (MC + red), so
  // we stop showing the "projected cut" line/divider from R3 on.
  const cut = live.cut;
  const cutMade = merged.some((r) => r.status === 'cut' || r.rounds?.[2] != null);
  const showCut = cut?.score != null && !cutMade;
  // The divider is shown only on the full, total-sorted board, where row order
  // reflects the actual standings.
  const showCutDivider = showCut && filter === 'all' && sort.key === 'total' && sort.dir === 'asc';
  let cutIdx = -1;
  if (showCutDivider) {
    rows.forEach((r, i) => {
      if (r.total !== null && r.total <= cut.score) cutIdx = i;
    });
  }

  return (
    <div>
      <PageHeader
        title="The Field"
        subtitle={settings?.tournament_name}
        action={
          <LiveStatus status={live.status} updatedAt={live.updatedAt} onRefresh={loadLive} />
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn-sm rounded-full capitalize ${
              filter === f ? 'btn-primary' : 'btn-outline'
            }`}
          >
            {f}
          </button>
        ))}
        {showCut && (
          <span
            className="chip bg-masters-gold-light text-masters-green"
            title={`Projected cut${cut.count ? ` — top ${cut.count} & ties` : ''} make the weekend`}
          >
            ✂ Proj. cut {scoreText(cut.score)}
          </span>
        )}
        <input
          className="input !py-1.5 ml-auto max-w-[180px]"
          placeholder="Search golfer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-masters-green-pale text-left text-[11px] uppercase text-gray-500 select-none">
              <th onClick={() => toggleSort('total')} className="pl-3 pr-1 py-2 font-semibold w-8 cursor-pointer hover:text-masters-green">Pos</th>
              <th onClick={() => toggleSort('name')} className="px-2 py-2 font-semibold cursor-pointer hover:text-masters-green">Golfer{caret('name')}</th>
              <th onClick={() => toggleSort('thru')} className="px-1 py-2 font-semibold text-center cursor-pointer hover:text-masters-green">Thru{caret('thru')}</th>
              <th onClick={() => toggleSort('r1')} className="px-1 py-2 font-semibold text-center cursor-pointer hover:text-masters-green">R1{caret('r1')}</th>
              <th onClick={() => toggleSort('r2')} className="px-1 py-2 font-semibold text-center cursor-pointer hover:text-masters-green">R2{caret('r2')}</th>
              <th onClick={() => toggleSort('r3')} className="px-1 py-2 font-semibold text-center cursor-pointer hover:text-masters-green">R3{caret('r3')}</th>
              <th onClick={() => toggleSort('r4')} className="px-1 py-2 font-semibold text-center cursor-pointer hover:text-masters-green">R4{caret('r4')}</th>
              <th onClick={() => toggleSort('total')} className="pr-3 pl-1 py-2 font-semibold text-right cursor-pointer hover:text-masters-green">Tot{caret('total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const color = teamColor(r.owner?.seed);
              const isCut = r.status === 'cut' || r.status === 'wd';
              const thruNum = /^\d+$/.test(String(r.thru));
              const liveIdx = liveRoundIndex(r.rounds, r.thru, r.status);
              const clickable = !!r.athleteId;
              return (
                <Fragment key={r.g.id}>
                <tr
                  onClick={() =>
                    clickable &&
                    setSelected({
                      name: r.g.name,
                      owner: r.owner?.name || null,
                      athleteId: r.athleteId,
                      teamSeed: r.owner?.seed ?? null,
                    })
                  }
                  className={`border-t border-masters-green-light/60 ${
                    r.owner ? `border-l-2 ${color.borderL}` : 'border-l-2 border-l-transparent'
                  } ${isCut ? 'bg-red-50' : ''} ${
                    clickable
                      ? `cursor-pointer ${isCut ? 'hover:bg-red-100/70' : 'hover:bg-masters-green-pale/60'}`
                      : ''
                  }`}
                >
                  <td className="pl-3 pr-1 py-2 text-center font-bold text-masters-green whitespace-nowrap">
                    {positionByGolfer[r.g.id] || '–'}
                  </td>
                  <td className="px-2 py-2">
                    <div
                      className={`font-medium ${isCut ? 'text-gray-400 line-through' : 'text-gray-800'}`}
                    >
                      {r.g.name}
                    </div>
                    {r.owner && (
                      <div className={`flex items-center gap-1 text-[11px] font-semibold ${color.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                        {r.owner.name}
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-1 py-2 text-center text-xs ${
                      thruNum ? 'text-amber-600 font-bold' : 'text-gray-400'
                    }`}
                  >
                    {isCut ? (r.status === 'wd' ? 'WD' : 'CUT') : r.thru}
                  </td>
                  {[0, 1, 2, 3].map((ri) => {
                    const v = r.rounds?.[ri];
                    const empty = v === null || v === undefined || v === '';
                    if (empty && isCut) {
                      return (
                        <td
                          key={ri}
                          className="px-1 py-2 text-center text-xs font-semibold text-score-over"
                        >
                          MC
                        </td>
                      );
                    }
                    // The round in play right now: gold tint + a pulsing dot, so a
                    // live score reads differently from a finished (final) one.
                    if (ri === liveIdx) {
                      return (
                        <td key={ri} className="px-1 py-2 text-center text-xs bg-masters-gold-light">
                          <span
                            className={`inline-flex items-center gap-0.5 font-semibold ${scoreColor(v ?? null)}`}
                            title={`Round ${ri + 1} · live (thru ${r.thru})`}
                          >
                            <span className="w-1 h-1 rounded-full bg-masters-gold animate-pulse" />
                            {scoreText(v ?? null)}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={ri}
                        className={`px-1 py-2 text-center text-xs ${scoreColor(v ?? null)}`}
                      >
                        {scoreText(v ?? null)}
                      </td>
                    );
                  })}
                  <td className={`pr-3 pl-1 py-2 text-right font-serif font-bold ${scoreColor(r.total)}`}>
                    {scoreText(r.total)}
                  </td>
                </tr>
                {showCutDivider && i === cutIdx && i < rows.length - 1 && (
                  <tr className="bg-masters-gold-light/40">
                    <td
                      colSpan={8}
                      className="py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-amber-700 border-y border-dashed border-amber-500"
                    >
                      ✂ Projected cut · {scoreText(cut.score)}
                      {cut.count ? ` · top ${cut.count}` : ''}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-gray-400 py-6">
                  No golfers. Load the field from the Admin panel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <PlayerScorecard player={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
