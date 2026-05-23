'use client';

import { teamColor } from '@/lib/teamColors';

// Kalshi-style win-probability race: one line per team (team-colored), with a
// 1/N even-odds baseline. teams: [{ id, name, seed, series:[{hole,pct}] }].
// highlightId (optional) draws that team's line bolder and fades the rest.
export default function ProbChart({ teams, baseline = 0, highlightId = null }) {
  const valid = (teams || []).filter((t) => t.series && t.series.length >= 2);
  if (valid.length === 0) return null;

  const W = 320;
  const H = 140;
  const padL = 6;
  const padR = 6;
  const padT = 10;
  const padB = 18;
  // Fixed 72-hole (4-round) width so R1–R4 always show; the line just stops
  // where the data does, leaving later rounds as empty space.
  const DOMAIN = 72;
  const x = (h) => padL + (h / DOMAIN) * (W - padL - padR);
  const y = (p) => padT + (1 - p) * (H - padT - padB);

  const rounds = [1, 2, 3, 4].map((r) => ({ r, label: `R${r}` }));

  // Legend sorted by current probability (leader first).
  const legend = valid
    .map((t) => ({
      ...t,
      cur: t.series[t.series.length - 1].pct,
      color: teamColor(t.seed).hex || '#2f6b40',
    }))
    .sort((a, b) => b.cur - a.cur);

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
        Win probability · to win the pool
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        {[18, 36, 54].map((h) => (
          <line key={h} x1={x(h)} x2={x(h)} y1={padT} y2={H - padB} stroke="#e5e7eb" strokeWidth="1" />
        ))}
        <line
          x1={padL}
          x2={W - padR}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="#9ca3af"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* draw non-highlighted first, highlighted on top */}
        {legend
          .slice()
          .sort((a, b) => (a.id === highlightId ? 1 : 0) - (b.id === highlightId ? 1 : 0))
          .map((t) => {
            const isHi = highlightId && t.id === highlightId;
            const d = t.series
              .map((s, i) => `${i ? 'L' : 'M'}${x(s.hole).toFixed(1)} ${y(s.pct).toFixed(1)}`)
              .join(' ');
            const last = t.series[t.series.length - 1];
            return (
              <g key={t.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={t.color}
                  strokeWidth={isHi ? 2.6 : 1.6}
                  strokeOpacity={highlightId && !isHi ? 0.5 : 1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle
                  cx={x(last.hole)}
                  cy={y(last.pct)}
                  r={isHi ? 3 : 2.2}
                  fill={t.color}
                  fillOpacity={highlightId && !isHi ? 0.5 : 1}
                />
              </g>
            );
          })}

        {rounds.map((d) => (
          <text key={d.r} x={x((d.r - 1) * 18 + 9)} y={H - 5} textAnchor="middle" fontSize="8" fill="#9ca3af">
            {d.label}
          </text>
        ))}
      </svg>

      <div className="mt-3 space-y-1">
        {legend.map((t) => {
          const isHi = highlightId && t.id === highlightId;
          return (
            <div key={t.id} className={`flex items-center gap-2 text-sm ${isHi ? 'font-bold' : ''}`}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <span className="flex-1 truncate" style={{ color: t.color }}>
                {t.name}
              </span>
              <span className="font-semibold tabular-nums" style={{ color: t.color }}>
                {Math.round(t.cur * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
