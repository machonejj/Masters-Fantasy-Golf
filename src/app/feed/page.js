'use client';

import { useEffect, useState } from 'react';
import { Loading, PageHeader } from '@/app/page';
import { scoreText, scoreColor } from '@/lib/scoring';
import { teamColor } from '@/lib/teamColors';
import ProbChart from '@/components/ProbChart';

// Visual weight by score: pars small + dull, birdies/eagles greener + bigger,
// bogeys/worse redder + bigger.
function eventStyle(toPar) {
  if (toPar <= -3)
    return { label: 'Albatross', emoji: '🦅', size: 'text-base', weight: 'font-extrabold', color: 'text-emerald-700', pad: 'py-2.5', tint: 'bg-emerald-50' };
  if (toPar === -2)
    return { label: 'Eagle', emoji: '🦅', size: 'text-[15px]', weight: 'font-bold', color: 'text-emerald-700', pad: 'py-2', tint: 'bg-emerald-50/60' };
  if (toPar === -1)
    return { label: 'Birdie', emoji: '🐦', size: 'text-sm', weight: 'font-semibold', color: 'text-emerald-600', pad: 'py-1.5', tint: '' };
  if (toPar === 0)
    return { label: 'Par', emoji: '', size: 'text-[11px]', weight: 'font-normal', color: 'text-gray-400', pad: 'py-0.5', tint: '' };
  if (toPar === 1)
    return { label: 'Bogey', emoji: '', size: 'text-sm', weight: 'font-medium', color: 'text-rose-500', pad: 'py-1.5', tint: '' };
  if (toPar === 2)
    return { label: 'Double Bogey', emoji: '💥', size: 'text-[15px]', weight: 'font-bold', color: 'text-rose-600', pad: 'py-2', tint: 'bg-rose-50/60' };
  return { label: `+${toPar}`, emoji: '💥', size: 'text-base', weight: 'font-extrabold', color: 'text-rose-700', pad: 'py-2.5', tint: 'bg-rose-50' };
}

export default function LiveFeedPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/feed')
        .then((r) => r.json())
        .then((d) => {
          if (alive) {
            setData(d);
            setStatus('ok');
          }
        })
        .catch(() => alive && setStatus('error'));
    load();
    const t = setInterval(load, 90000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (status === 'loading' && !data) return <Loading />;

  const events = data?.events || [];
  const teams = data?.teams || [];

  return (
    <div>
      <PageHeader title="Live Feed" subtitle="Drafted players · hole by hole" />

      {teams.length > 0 && (
        <div className="card mb-5">
          <ProbChart teams={teams} baseline={data.baseline} highlightId={data.myTeamId} compact />
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {events.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No scoring yet — check back once play is underway.
          </p>
        ) : (
          events.map((e, i) => {
            const s = eventStyle(e.toPar);
            const c = teamColor(e.seed);
            const isMine = data.myTeamId && e.teamId === data.myTeamId;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 ${s.pad} border-b border-masters-green-light/40 last:border-0 ${
                  isMine ? '' : s.tint
                }`}
                style={
                  isMine ? { borderLeft: `3px solid ${c.hex}`, backgroundColor: `${c.hex}14` } : undefined
                }
              >
                <span className="w-5 text-center shrink-0">{s.emoji}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <span className={`${s.size} ${s.weight} ${s.color}`}>{e.golfer}</span>
                  <span className={`${s.size} ${s.color} opacity-70`}> · {s.label}</span>
                  <span className="text-[10px] text-gray-400 ml-1">
                    R{e.round}·{e.hole}
                  </span>
                </div>
                <span
                  className="flex items-center gap-1 text-[11px] font-semibold shrink-0"
                  style={{ color: c.hex || undefined }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.hex || '#9ca3af' }}
                  />
                  <span className="max-w-[78px] truncate">{e.team}</span>
                </span>
                <span className={`w-8 text-right text-xs font-semibold ${scoreColor(e.total)}`}>
                  {scoreText(e.total)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
