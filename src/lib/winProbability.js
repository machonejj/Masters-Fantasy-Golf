// Live win-probability model for the fantasy pool. Each golfer carries a
// cumulative to-par array (cum[h] = strokes to par after h holes). At
// tournament hole T we simulate the remaining holes for every golfer many
// times, count which team has the lowest team-score per sim, and that
// becomes that team's raw probability.
//
// On top of the Monte Carlo, two damping layers keep early-tournament
// movement believable:
//   * Bayesian prior on form (PRIOR_HOLES) — a single hole barely moves a
//     golfer's projected pace because the prior pulls toward par until
//     many holes have been played.
//   * Outer confidence blend with the 1/N baseline (PROGRESS_EXPONENT) —
//     the chart sits visually on top of even-odds during R1 and gradually
//     unlocks to fully live by Sunday back-9.
//
// All knobs live in WIN_PROB_CONFIG for easy tuning.

import { CUT_ROUND_PENALTY } from './scoring';

export const WIN_PROB_CONFIG = {
  TOTAL_HOLES: 72,

  // Bayesian effective sample size for a golfer's realized pace. Larger =
  // more conservative early projections. Weight on realized form is
  // `1 - exp(-hp / PRIOR_HOLES)`. With 36:
  //   hp=1  → 0.027   hp=18 → 0.39   hp=36 → 0.63   hp=54 → 0.78   hp=71 → 0.86
  PRIOR_HOLES: 36,

  // Outer confidence blend with 1/N: trust = (T / TOTAL_HOLES)^PROGRESS_EXPONENT.
  // Higher = flatter chart for longer. 0.55 lets hole 1 register a small
  // nudge (1-2 pts on a big move), keeps R1 mostly subdued, and unlocks to
  // fully live by hole 72.
  //   T=1  → 0.10   T=9  → 0.32   T=18 → 0.47   T=36 → 0.68   T=54 → 0.84   T=72 → 1.00
  PROGRESS_EXPONENT: 0.55,

  // Base per-round to-par standard deviation for a tour pro.
  ROUND_SIGMA: 4.3,
  // Per-round volatility multiplier indexed by the round currently in play
  // at T. Wider σ early → more overlap between teams → flatter odds early.
  ROUND_SIGMA_MULT: [1.35, 1.15, 1.0, 0.85],

  // Momentum: last MOMENTUM_WINDOW holes of a golfer's pace get a small
  // additive nudge to the projected mean. Sustained good play reads
  // slightly above isolated good shots; one shot can't dominate.
  MOMENTUM_WINDOW: 9,
  MOMENTUM_WEIGHT: 0.10,

  // EMA smoothing on the rendered series. Half-life in holes; per-team pct
  // is exponentially smoothed then renormalized so teams sum to 1 at every
  // hole. Identical α across teams preserves ordering — only spike sharpness
  // is reduced. 0 disables smoothing entirely; the damping above usually
  // makes the raw curve smooth enough on its own. Bump to 2-3 if jaggies
  // appear in production.
  SMOOTH_HALFLIFE_HOLES: 0,
};

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function roundSigmaMult(T) {
  const idx = Math.min(3, Math.max(0, Math.floor(T / 18)));
  return WIN_PROB_CONFIG.ROUND_SIGMA_MULT[idx];
}

// Monte Carlo win probabilities at tournament hole T. For each golfer:
//   projection = known + meanPerHole * remHoles + σ * Z
// where meanPerHole is Bayesian-weighted realized pace plus a small
// momentum term, and σ scales with remaining rounds and current-round
// volatility multiplier.
function winProbAtHole(teams, T, { counting, cutRoundPenalty, sims, sigmaBase }) {
  const { TOTAL_HOLES, PRIOR_HOLES, MOMENTUM_WINDOW, MOMENTUM_WEIGHT } = WIN_PROB_CONFIG;
  const ids = teams.map((t) => t.id);
  const wins = Object.fromEntries(ids.map((id) => [id, 0]));
  const sigmaScale = roundSigmaMult(T);

  const prep = teams.map((t) => ({
    id: t.id,
    golfers: t.golfers.map((g) => {
      const cut = g.status === 'cut' || g.status === 'wd';
      const hp = Math.min(T, g.holesPlayed);
      const known = g.cum[hp] ?? g.cum[g.cum.length - 1] ?? 0;
      // Bayesian weight on realized pace — heavy prior toward par early.
      const wKnown = hp > 0 ? 1 - Math.exp(-hp / PRIOR_HOLES) : 0;
      let meanPerHole = hp > 0 ? wKnown * (known / hp) : 0;
      if (hp >= 2) {
        const w = Math.min(MOMENTUM_WINDOW, hp);
        const tailKnown = known - (g.cum[hp - w] ?? 0);
        const tailMean = tailKnown / w;
        meanPerHole += MOMENTUM_WEIGHT * (tailMean - meanPerHole);
      }
      const remHoles = cut ? 0 : Math.max(0, TOTAL_HOLES - T);
      const missedRounds = cut ? Math.max(0, (TOTAL_HOLES - g.holesPlayed) / 18) : 0;
      return {
        cut,
        known,
        meanPerHole,
        remHoles,
        remRounds: remHoles / 18,
        cutTotal: known + missedRounds * cutRoundPenalty,
      };
    }),
  }));

  for (let s = 0; s < sims; s++) {
    let best = Infinity;
    let bestTeams = [];
    for (const t of prep) {
      const totals = t.golfers.map((g) => {
        if (g.cut) return g.cutTotal;
        const sigma = sigmaBase * sigmaScale * Math.sqrt(g.remRounds);
        const proj = g.known + g.meanPerHole * g.remHoles + sigma * randn();
        return Math.round(proj);
      });
      totals.sort((a, b) => a - b);
      const teamScore = totals.slice(0, counting).reduce((a, b) => a + b, 0);
      if (teamScore < best - 1e-9) {
        best = teamScore;
        bestTeams = [t.id];
      } else if (Math.abs(teamScore - best) < 1e-9) {
        bestTeams.push(t.id);
      }
    }
    const share = 1 / bestTeams.length;
    for (const id of bestTeams) wins[id] += share;
  }

  const out = {};
  for (const id of ids) out[id] = wins[id] / sims;
  return out;
}

// Outer confidence blend: pull MC output toward the 1/N baseline. Trust
// grows with tournament progress so R1 reads near even-odds and Sunday
// back-9 is fully live. Sum across teams stays = 1 because both pieces do.
function dampToward(baseline, T, mcPct) {
  const trust = Math.min(
    1,
    Math.pow(T / WIN_PROB_CONFIG.TOTAL_HOLES, WIN_PROB_CONFIG.PROGRESS_EXPONENT)
  );
  return trust * mcPct + (1 - trust) * baseline;
}

// EMA-smooth each team's pct series, then renormalize across teams per
// hole so the stacked sum stays 1.
function smoothSeries(seriesByTeam, holeCount) {
  const halfLife = WIN_PROB_CONFIG.SMOOTH_HALFLIFE_HOLES;
  const alpha = halfLife > 0 ? 1 - Math.pow(0.5, 1 / halfLife) : 1;
  const teamIds = Object.keys(seriesByTeam);
  if (teamIds.length === 0 || alpha >= 1) return seriesByTeam;

  const smoothed = Object.fromEntries(
    teamIds.map((id) => [id, seriesByTeam[id].map((p) => ({ ...p }))])
  );
  for (let i = 1; i < holeCount; i++) {
    let sum = 0;
    for (const id of teamIds) {
      const prev = smoothed[id][i - 1].pct;
      const raw = seriesByTeam[id][i].pct;
      const v = alpha * raw + (1 - alpha) * prev;
      smoothed[id][i].pct = v;
      sum += v;
    }
    if (sum > 0) {
      for (const id of teamIds) smoothed[id][i].pct /= sum;
    }
  }
  return smoothed;
}

// Every team's win-probability line in one pass: 1/N at hole 0, then a
// point per played hole. Returns { [teamId]: [{ hole, pct }] }.
// The `sd` option (if provided) overrides ROUND_SIGMA so existing call
// sites stay backward-compatible.
export function allTeamWinSeries(
  teams,
  { counting = 3, cutRoundPenalty = CUT_ROUND_PENALTY, sims = 800, sd } = {}
) {
  const n = teams.length;
  if (n === 0) return {};

  const sigmaBase = sd ?? WIN_PROB_CONFIG.ROUND_SIGMA;
  const baseline = 1 / n;

  let maxT = 0;
  for (const t of teams) for (const g of t.golfers) maxT = Math.max(maxT, g.holesPlayed);
  maxT = Math.min(maxT, WIN_PROB_CONFIG.TOTAL_HOLES);

  const out = Object.fromEntries(teams.map((t) => [t.id, [{ hole: 0, pct: baseline }]]));
  for (let T = 1; T <= maxT; T++) {
    const p = winProbAtHole(teams, T, { counting, cutRoundPenalty, sims, sigmaBase });
    for (const t of teams) {
      const damped = dampToward(baseline, T, p[t.id] ?? 0);
      out[t.id].push({ hole: T, pct: damped });
    }
  }
  return smoothSeries(out, maxT + 1);
}
