// Monte Carlo win probabilities, computed hole-by-hole so the odds line has
// lots of points. Each golfer carries a cumulative to-par sequence (cum[h] =
// to-par after h holes). At tournament-hole T we know each golfer's score
// through T and simulate the rest; before any golf every team is equal → 1/N.

import { CUT_ROUND_PENALTY } from './scoring';

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const TOTAL_HOLES = 72;

// teams: [{ id, golfers: [{ cum: [0, …], holesPlayed, status }] }]
// sd = a round's scoring spread (to-par strokes); higher = looser/less certain odds.
function winProbAtHole(teams, T, { counting, cutRoundPenalty, sims, sd }) {
  const ids = teams.map((t) => t.id);
  const wins = Object.fromEntries(ids.map((id) => [id, 0]));

  const prep = teams.map((t) => ({
    id: t.id,
    golfers: t.golfers.map((g) => {
      const cut = g.status === 'cut' || g.status === 'wd';
      const hp = Math.min(T, g.holesPlayed); // holes known as of T
      const known = g.cum[hp] ?? g.cum[g.cum.length - 1] ?? 0;
      const form = hp > 0 ? (known / hp) * 18 : 0; // pace, scaled to a round
      const meanPerRound = form * (hp / (hp + 18)); // regress to par when little is known
      const remHoles = cut ? 0 : Math.max(0, TOTAL_HOLES - T);
      // A cut golfer is frozen at their to-par through the cut plus the per-round
      // penalty for each round they won't play.
      const missedRounds = cut ? Math.max(0, (TOTAL_HOLES - g.holesPlayed) / 18) : 0;
      return { cut, known, meanPerRound, rr: remHoles / 18, cutTotal: known + missedRounds * cutRoundPenalty };
    }),
  }));

  for (let s = 0; s < sims; s++) {
    let best = Infinity;
    let bestTeams = [];
    for (const t of prep) {
      const totals = t.golfers.map((g) => {
        if (g.cut) return g.cutTotal;
        const proj = g.known + g.meanPerRound * g.rr + sd * Math.sqrt(g.rr) * randn();
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

// Every team's win-probability line in one pass: 1/N at the start, then a point
// per hole played. Returns { [teamId]: [{ hole, pct }] }.
export function allTeamWinSeries(
  teams,
  { counting = 3, cutRoundPenalty = CUT_ROUND_PENALTY, sims = 800, sd = 4.3 } = {}
) {
  const n = teams.length;
  if (n === 0) return {};

  let maxT = 0;
  for (const t of teams) for (const g of t.golfers) maxT = Math.max(maxT, g.holesPlayed);
  maxT = Math.min(maxT, TOTAL_HOLES);

  const out = Object.fromEntries(teams.map((t) => [t.id, [{ hole: 0, pct: 1 / n }]]));
  for (let T = 1; T <= maxT; T++) {
    const p = winProbAtHole(teams, T, { counting, cutRoundPenalty, sims, sd });
    for (const t of teams) out[t.id].push({ hole: T, pct: p[t.id] ?? 0 });
  }
  return out;
}
