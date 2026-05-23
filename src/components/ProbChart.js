'use client';

// Kalshi-style win-probability line. series: [{ hole, pct }] (pct 0–1),
// baseline: the even-odds line (1/N) drawn faintly for reference.
export default function ProbChart({ series, baseline = 0 }) {
  if (!series || series.length < 2) return null;

  const W = 320;
  const H = 132;
  const padL = 6;
  const padR = 6;
  const padT = 10;
  const padB = 18;
  const maxHole = series[series.length - 1].hole || 72;

  const x = (h) => padL + (h / Math.max(maxHole, 1)) * (W - padL - padR);
  const y = (p) => padT + (1 - p) * (H - padT - padB);

  const pts = series.map((s) => [x(s.hole), y(s.pct)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area =
    `M${pts[0][0].toFixed(1)} ${y(0).toFixed(1)} ` +
    pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
    ` L${pts[pts.length - 1][0].toFixed(1)} ${y(0).toFixed(1)} Z`;

  const cur = series[series.length - 1].pct;
  const start = series[0].pct;
  const up = cur >= start;
  const stroke = up ? '#2f6b40' : '#b45309';
  const delta = Math.round((cur - start) * 100);

  // Round separators / labels for rounds that have data.
  const rounds = [
    { r: 1, label: 'R1' },
    { r: 2, label: 'R2' },
    { r: 3, label: 'R3' },
    { r: 4, label: 'R4' },
  ].filter((d) => maxHole > (d.r - 1) * 18);

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Win probability</div>
          <div className="text-xs text-gray-400">to win the pool</div>
        </div>
        <div className="text-right">
          <div className={`font-serif text-3xl font-bold leading-none ${up ? 'text-score-under' : 'text-score-over'}`}>
            {Math.round(cur * 100)}%
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {delta === 0 ? 'even with start' : `${delta > 0 ? '▲ +' : '▼ '}${delta}% since start`}
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="probgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* round separators */}
        {[18, 36, 54].filter((h) => h < maxHole).map((h) => (
          <line key={h} x1={x(h)} x2={x(h)} y1={padT} y2={H - padB} stroke="#e5e7eb" strokeWidth="1" />
        ))}
        {/* even-odds baseline */}
        <line
          x1={padL}
          x2={W - padR}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="#9ca3af"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        <path d={area} fill="url(#probgrad)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={stroke} />

        {/* round labels (centered in each round span) */}
        {rounds.map((d) => (
          <text
            key={d.r}
            x={x((d.r - 1) * 18 + 9)}
            y={H - 5}
            textAnchor="middle"
            fontSize="8"
            fill="#9ca3af"
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
