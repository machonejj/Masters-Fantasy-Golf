'use client';

import { teamColor } from '@/lib/teamColors';
import { scoreText, scoreColor } from '@/lib/scoring';

// Clip a team's win-prob series to the field's current progress `now` (in
// tournament holes, 0–72). Without this, every line runs to the single furthest
// golfer's hole (e.g. a leader who finished R3 → hole 54), so the end dots land
// at the end of R3 even though the field is mid-round. We interpolate the
// win-prob exactly at `now` so the dot sits right on the dashed "now" marker,
// and drop later holes so future rounds stay empty.
function clipSeries(series, now) {
  if (now == null) return series;
  const kept = series.filter((s) => s.hole <= now);
  if (kept.length === 0) return series.slice(0, 1);
  const last = kept[kept.length - 1];
  const next = series.find((s) => s.hole > now);
  if (!next || last.hole === now) return kept;
  const f = (now - last.hole) / (next.hole - last.hole);
  return [...kept, { hole: now, pct: last.pct + f * (next.pct - last.pct) }];
}

// Bloomberg/FT-style right-edge label rail. Lay each team's end-dot label out
// vertically in the rail (sorted by current win prob), push down to maintain
// minimum vertical spacing, then pull back up from the bottom if the stack
// runs past the chart. Returns one y per legend entry, in legend order.
function stackLabelYs(legend, y, minGap, topY, bottomY) {
  const ys = legend.map((t) => y(t.cur));
  // Top-down pass: push each label below its predecessor if too close.
  let prev = topY - minGap;
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] < prev + minGap) ys[i] = prev + minGap;
    prev = ys[i];
  }
  // Bottom-up pass: if the stack overflowed the bottom, pull labels up.
  if (prev > bottomY) {
    prev = bottomY + minGap;
    for (let i = ys.length - 1; i >= 0; i--) {
      if (ys[i] > prev - minGap) ys[i] = prev - minGap;
      prev = ys[i];
    }
  }
  return ys;
}

// Pick a "nice" tick step (5%, 10%, 20%, etc.) so the dynamic Y-axis labels
// land on familiar values even though the range itself is data-driven.
function niceStep(range, targetCount) {
  const step0 = range / Math.max(1, targetCount - 1);
  const choices = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5];
  for (const c of choices) if (c >= step0) return c;
  return 0.5;
}
function buildTicks(min, max, targetCount) {
  const step = niceStep(max - min, targetCount);
  const first = Math.ceil(min / step - 1e-9) * step;
  const ticks = [];
  for (let v = first; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(4));
  return ticks;
}

// Kalshi-style win-probability race: one line per team (team-colored), with a
// 1/N even-odds baseline. teams: [{ id, name, seed, series:[{hole,pct}] }].
// highlightId (optional) draws that team's line bolder and fades the rest.
// now (optional, 0–72 tournament holes) draws a live "where the field is" marker
// so a single leader finishing a round doesn't make the round look complete.
export default function ProbChart({ teams, baseline = 0, highlightId = null, compact = false, now = null }) {
  const valid = (teams || []).filter((t) => t.series && t.series.length >= 2);
  if (valid.length === 0) return null;

  const W = 320;
  const H = compact ? 139 : 263;
  const padL = 24; // room for the Y-axis percentage labels
  const padR = 80; // room for the right-edge label rail
  const padT = compact ? 6 : 10;
  const padB = compact ? 13 : 18;
  // Show R1+R2 by default; widen only when a round actually completes
  // (R2 done → add R3; R3 done → add R4). Pre-tournament also shows R1+R2.
  const roundsToShow = now == null ? 2 : Math.max(2, Math.min(4, Math.floor(now / 18) + 1));
  const DOMAIN = roundsToShow * 18;
  const x = (h) => padL + (h / DOMAIN) * (W - padL - padR);

  const rounds = Array.from({ length: roundsToShow }, (_, i) => ({ r: i + 1, label: `R${i + 1}` }));

  // Live field progress → "Round 3 · thru 14".
  const nowRound = now != null ? Math.floor(now / 18) + 1 : null;
  const nowThru = now != null ? Math.round(now % 18) : null;
  const progressLabel =
    now == null
      ? null
      : nowThru === 0 && nowRound > 1
        ? `Round ${nowRound - 1} complete`
        : `Round ${nowRound} · thru ${nowThru}`;

  // Legend sorted by current probability (leader first). Each series is clipped
  // to the field's current progress so the line + end dot stop at "now".
  const legend = valid
    .map((t) => {
      const series = clipSeries(t.series, now);
      return {
        ...t,
        series,
        cur: series[series.length - 1].pct,
        color: teamColor(t.seed).hex || '#2f6b40',
      };
    })
    .sort((a, b) => b.cur - a.cur);

  // Dynamic Y-axis — zoom to the actual range of the data so movement between
  // teams isn't compressed by all the empty 60%+ space. Always include the
  // even-odds baseline as a visual anchor; expand to a minimum window so the
  // chart never feels weirdly cramped; pad the range so end-dots aren't
  // glued to the chart edges.
  let yMin = baseline;
  let yMax = baseline;
  for (const t of legend) {
    for (const s of t.series) {
      if (s.pct < yMin) yMin = s.pct;
      if (s.pct > yMax) yMax = s.pct;
    }
  }
  const MIN_WINDOW = 0.12;
  if (yMax - yMin < MIN_WINDOW) {
    const center = (yMin + yMax) / 2;
    yMin = center - MIN_WINDOW / 2;
    yMax = center + MIN_WINDOW / 2;
  }
  const yPad = (yMax - yMin) * 0.2;
  yMin = Math.max(0, yMin - yPad);
  yMax = Math.min(1, yMax + yPad);

  const y = (p) => padT + ((yMax - p) / (yMax - yMin)) * (H - padT - padB);
  const yTicks = buildTicks(yMin, yMax, compact ? 3 : 5);

  // Vertical positions for the right-rail labels.
  const minGap = compact ? 11 : 16;
  const labelYs = stackLabelYs(legend, y, minGap, padT + 4, H - padB - 4);
  const railX = W - padR + 2; // viewBox-x where the label rail begins

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-400">
          Win probability · to win the pool
        </span>
        {progressLabel && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-masters-gold whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-masters-gold animate-pulse" />
            {progressLabel}
          </span>
        )}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" preserveAspectRatio="none">
          {/* Horizontal probability gridlines + Y-axis % labels (dynamic) */}
          {yTicks.map((p) => (
            <g key={p}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(p)}
                y2={y(p)}
                stroke="#eef1ee"
                strokeWidth="1"
              />
              <text
                x={padL - 4}
                y={y(p)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={compact ? 7 : 8}
                fill="#9ca3af"
              >
                {Math.round(p * 100)}%
              </text>
            </g>
          ))}

          {/* Round dividers (only within visible domain) */}
          {[18, 36, 54].filter((h) => h < DOMAIN).map((h) => (
            <line key={h} x1={x(h)} x2={x(h)} y1={padT} y2={H - padB} stroke="#e5e7eb" strokeWidth="1" />
          ))}

          {/* Even-odds baseline */}
          <line
            x1={padL}
            x2={W - padR}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="#9ca3af"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Live "now" marker — where the field currently is */}
          {now != null && (
            <g>
              <line
                x1={x(now)}
                x2={x(now)}
                y1={padT}
                y2={H - padB}
                stroke="#c9a84c"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle cx={x(now)} cy={padT} r="1.7" fill="#c9a84c" className="animate-pulse" />
            </g>
          )}

          {/* Connector lines from each end-dot to its label in the rail */}
          {legend.map((t, i) => {
            const last = t.series[t.series.length - 1];
            const isHi = highlightId && t.id === highlightId;
            return (
              <line
                key={`c-${t.id}`}
                x1={x(last.hole)}
                y1={y(last.pct)}
                x2={railX - 1}
                y2={labelYs[i]}
                stroke={t.color}
                strokeWidth={isHi ? 0.7 : 0.45}
                strokeOpacity={highlightId && !isHi ? 0.3 : 0.55}
              />
            );
          })}

          {/* Series lines (non-highlighted first so the highlighted draws on top) */}
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
                    strokeWidth={isHi ? 1.1 : 0.7}
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
                    className="animate-pulse"
                  />
                </g>
              );
            })}

          {/* Round labels at the bottom of the plot area */}
          {rounds.map((d) => (
            <text
              key={d.r}
              x={x((d.r - 1) * 18 + 9)}
              y={H - (compact ? 3 : 5)}
              textAnchor="middle"
              fontSize={compact ? 7 : 8}
              fill="#9ca3af"
            >
              {d.label}
            </text>
          ))}
        </svg>

        {/* Right-edge label rail (HTML overlay so text isn't stretched by the
            SVG's preserveAspectRatio="none"). Each label sits at the vertical
            position computed in labelYs[i], expressed as a % of the SVG height. */}
        <div className="absolute inset-0 pointer-events-none">
          {legend.map((t, i) => {
            const isHi = highlightId && t.id === highlightId;
            return (
              <div
                key={t.id}
                className={`absolute flex items-center gap-1 whitespace-nowrap leading-none ${
                  compact ? 'text-[10px]' : 'text-[11px]'
                } ${isHi ? 'font-bold' : 'font-medium'}`}
                style={{
                  top: `${(labelYs[i] / H) * 100}%`,
                  left: `${(railX / W) * 100}%`,
                  transform: 'translateY(-50%)',
                  color: t.color,
                  opacity: highlightId && !isHi ? 0.7 : 1,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <span className="truncate max-w-[56px]">{t.name}</span>
                {t.total !== null && t.total !== undefined && (
                  <span className={`tabular-nums ${scoreColor(t.total)}`}>{scoreText(t.total)}</span>
                )}
                <span className="tabular-nums font-semibold">{Math.round(t.cur * 100)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
