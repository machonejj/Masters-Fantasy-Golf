'use client';

import { useEffect, useMemo, useState } from 'react';
import { scoreText, scoreColor } from '@/lib/scoring';
import { teamColor } from '@/lib/teamColors';

// Background tint for a hole based on its score to-par (eagle/birdie green,
// par neutral, bogey/double red) — the color-coded scorecard look.
function holeClass(toPar) {
  if (toPar <= -2) return 'bg-emerald-200 text-emerald-900 font-bold';
  if (toPar === -1) return 'bg-emerald-100 text-emerald-800';
  if (toPar === 1) return 'bg-red-100 text-red-700';
  if (toPar >= 2) return 'bg-red-200 text-red-900 font-bold';
  return 'bg-gray-100 text-gray-600';
}

function fmtDateRange(start, end) {
  if (!start) return '';
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  const mon = s.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const d1 = s.getUTCDate();
  const d2 = e.getUTCDate();
  const yr = s.getUTCFullYear();
  return d1 === d2 ? `${mon} ${d1}, ${yr}` : `${mon} ${d1}–${d2}, ${yr}`;
}

function dayLabel(start, round) {
  if (!start) return `R${round}`;
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + (round - 1));
  return d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
}

// ESPN headshot for a golfer by their athlete id (transparent PNG). Not every
// player has one, so the <img> hides itself on error.
function headshotUrl(athleteId) {
  return athleteId
    ? `https://a.espncdn.com/i/headshots/golf/players/full/${athleteId}.png`
    : null;
}

export default function PlayerScorecard({ player, onClose }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [imgOk, setImgOk] = useState(true);
  const color = teamColor(player.teamSeed);
  const headshot = headshotUrl(player.athleteId);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setImgOk(true);
    const qs = player.athleteId
      ? `athleteId=${player.athleteId}`
      : `name=${encodeURIComponent(player.name)}`;
    fetch(`/api/golfers/scorecard?${qs}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) throw new Error(body.error || 'failed');
        setData(body);
        setStatus('ok');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [player.athleteId, player.name]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const roundByNum = useMemo(() => {
    const m = new Map();
    (data?.rounds || []).forEach((rd) => m.set(rd.round, rd));
    return m;
  }, [data]);

  const start = data?.dates?.start;
  const courseLine = data?.course
    ? [data.course.name, [data.course.city, data.course.state].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : null;

  return (
    <div
      data-swipe-block
      className="fixed inset-0 z-[100] bg-black/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="flex items-start gap-3 min-w-0">
              {headshot && imgOk && (
                <img
                  src={headshot}
                  alt={player.name}
                  onError={() => setImgOk(false)}
                  className="w-14 h-14 rounded-full object-cover bg-masters-green-light border border-masters-green-light shrink-0"
                />
              )}
              <div className="min-w-0">
                <h2 className="font-serif text-2xl text-masters-green leading-tight">
                  {player.name}
                </h2>
                {courseLine && <p className="text-sm text-gray-500 mt-0.5">{courseLine}</p>}
                {player.owner && (
                  <span
                    className={`inline-flex items-center gap-1.5 mt-2 text-xs font-semibold rounded-md px-2 py-1 ${color.bg} ${color.text}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                    {player.owner}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`font-serif text-4xl font-bold ${scoreColor(data?.total)}`}>
                {scoreText(data?.total)}
              </div>
              <div className="text-[11px] text-gray-400 uppercase tracking-wide">Total to par</div>
            </div>
          </div>
          {data?.tournament && (
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mt-3">
              {data.tournament} · Par {data.coursePar} · {fmtDateRange(start, data?.dates?.end)}
            </p>
          )}
        </div>

        {status === 'loading' && (
          <div className="py-16 text-center text-gray-400">Loading scorecard…</div>
        )}
        {status === 'error' && (
          <div className="py-16 text-center text-gray-400">Scorecard unavailable right now.</div>
        )}

        {status === 'ok' && (
          <div className="p-5 space-y-5">
            {/* Round summary cards */}
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((rn) => {
                const rd = roundByNum.get(rn);
                const live = rd && !rd.complete && rd.holesPlayed > 0;
                return (
                  <div
                    key={rn}
                    className={`rounded-xl border p-3 text-center ${
                      live
                        ? 'border-masters-gold bg-masters-gold-light/40'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {dayLabel(start, rn)}
                      {live && ` · Thru ${rd.holesPlayed}`}
                    </div>
                    <div className={`font-serif text-2xl font-bold mt-1 ${scoreColor(rd?.toPar)}`}>
                      {rd ? scoreText(rd.toPar) : '—'}
                    </div>
                    {rd?.complete && <div className="text-[10px] text-gray-400 mt-0.5">✓ Final</div>}
                  </div>
                );
              })}
            </div>

            {/* Hole-by-hole, per played round */}
            {(data.rounds || [])
              .filter((rd) => rd.holes.length > 0)
              .map((rd) => (
                <div key={rd.round}>
                  <div className="text-xs font-semibold text-masters-green mb-1.5">
                    {dayLabel(start, rd.round)}
                    <span className="text-gray-400 font-normal">
                      {' '}
                      · {scoreText(rd.toPar)} {rd.complete ? '· Final' : `· Thru ${rd.holesPlayed}`}
                    </span>
                  </div>
                  <div className="overflow-x-auto -mx-1 px-1">
                    <HoleGrid holes={rd.holes} coursePars={data.course?.holes} />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HoleGrid({ holes, coursePars }) {
  // Always render holes 1-18 in natural order. ESPN omits holes a golfer
  // hasn't reached yet, so a 10-tee starter has gaps before hole 10 mid-round.
  // Par for those unplayed holes comes from the course meta (coursePars) so
  // the PAR row is complete even though SCORE is blank.
  const byNum = new Map(holes.map((h) => [h.hole, h]));
  const parByNum = new Map((coursePars || []).map((c) => [c.number, c.par]));
  const slots = Array.from({ length: 18 }, (_, i) => {
    const num = i + 1;
    const played = byNum.get(num);
    return {
      hole: num,
      par: played?.par ?? parByNum.get(num) ?? null,
      played,
    };
  });

  return (
    <table className="text-xs border-separate border-spacing-0.5">
      <tbody>
        <tr>
          <Cell label className="text-gray-400">HOLE</Cell>
          {slots.map((s) => (
            <Cell key={s.hole} className="text-gray-400 font-medium">{s.hole}</Cell>
          ))}
        </tr>
        <tr>
          <Cell label className="text-gray-400">PAR</Cell>
          {slots.map((s) => (
            <Cell key={s.hole} className="text-gray-400">{s.par ?? '—'}</Cell>
          ))}
        </tr>
        <tr>
          <Cell label className="text-masters-green font-semibold">SCORE</Cell>
          {slots.map((s) => (
            <Cell
              key={s.hole}
              className={s.played ? `rounded ${holeClass(s.played.toPar)}` : 'text-gray-300'}
            >
              {s.played ? s.played.strokes : '—'}
            </Cell>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function Cell({ children, label, className = '' }) {
  return (
    <td
      className={`text-center ${
        label ? 'pr-2 text-[10px] uppercase tracking-wide text-right' : 'w-7 h-7 min-w-7'
      } ${className}`}
    >
      {children}
    </td>
  );
}
