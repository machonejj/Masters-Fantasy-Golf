import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildPoolLive } from '@/lib/poolLive';
import { allTeamWinSeries } from '@/lib/winProbability';
import { CUT_ROUND_PENALTY } from '@/lib/scoring';

// Sum of the best `n` golfer totals (lower is better); ignores golfers with no
// score yet. Same best-N rule the standings use.
function bestN(totals, n) {
  const v = totals
    .filter((t) => t !== null && t !== undefined)
    .sort((a, b) => a - b)
    .slice(0, n);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

// Live feed of drafted golfers' holes (newest first) + the win-probability
// series, from one set of ESPN fetches. Each hole event is enriched with the
// team-score transition it caused and flags for highlight moments (lead change,
// top-3 in/out). No scoring rules change here — team totals are reconstructed
// hole by hole with the same best-N + cut-penalty model as the standings.
export async function GET() {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { settings, participants, me, teams } = await buildPoolLive(ctx.user.id);
  if (!teams.length) return NextResponse.json({ events: [], teams: [], reason: 'no-draft' });

  const counting = settings?.counting_scores ?? 3;
  const seriesByTeam = allTeamWinSeries(teams, { counting, sims: 800 });

  // ── Per-golfer setup: cut-penalty offset + team membership ────────────────
  const gkey = (teamId, name) => `${teamId}|${name}`;
  const offset = {}; // golfer key → strokes added for rounds they won't play
  const teamGolfers = {}; // teamId → [golfer key]
  for (const t of teams) {
    teamGolfers[t.id] = [];
    for (const g of t.golfers) {
      const cut = g.status === 'cut' || g.status === 'wd';
      const completed = Math.floor(g.holesPlayed / 18);
      offset[gkey(t.id, g.name)] = cut ? Math.max(0, 4 - completed) * CUT_ROUND_PENALTY : 0;
      teamGolfers[t.id].push(gkey(t.id, g.name));
    }
  }

  // Running real to-par per golfer, updated as we walk the timeline (null until
  // they've played a hole). Team total = best-N of (real + cut offset).
  const real = {};
  const teamTotal = (teamId, overrideKey, overrideReal) =>
    bestN(
      teamGolfers[teamId].map((k) => {
        const rt = k === overrideKey ? overrideReal : real[k] ?? null;
        return rt === null || rt === undefined ? null : rt + offset[k];
      }),
      counting
    );

  // ── Back-to-back birdies (consecutive under-par holes) ────────────────────
  const b2b = new Set();
  for (const t of teams) {
    for (const g of t.golfers) {
      const hs = [...g.holes].sort((a, b) => a.round - b.round || a.hole - b.hole);
      for (let i = 1; i < hs.length; i++) {
        if (hs[i].toPar < 0 && hs[i - 1].toPar < 0) {
          b2b.add(`${gkey(t.id, g.name)}|${hs[i].round}|${hs[i].hole}`);
        }
      }
    }
  }

  // ── Flatten every hole, then reconstruct standings chronologically ────────
  const all = [];
  for (const t of teams)
    for (const g of t.golfers)
      for (const h of g.holes)
        all.push({
          golfer: g.name,
          teamId: t.id,
          team: t.name,
          seed: t.seed,
          round: h.round,
          hole: h.hole,
          toPar: h.toPar,
          total: h.total,
        });

  const enrich = {}; // event key → team transition + highlight flags
  for (const e of [...all].sort((a, b) => a.round - b.round || a.hole - b.hole)) {
    const k = gkey(e.teamId, e.golfer);
    const before = real[k] ?? null; // golfer total before this hole
    const teamBefore = teamTotal(e.teamId, k, before);
    const teamAfter = teamTotal(e.teamId, k, e.total);
    const others = teams.filter((tt) => tt.id !== e.teamId).map((tt) => teamTotal(tt.id));
    const rank = (tot) => (tot === null ? 99 : 1 + others.filter((x) => x !== null && x < tot).length);
    const rb = rank(teamBefore);
    const ra = rank(teamAfter);
    const moved = teamBefore !== teamAfter;
    enrich[`${k}|${e.round}|${e.hole}`] = {
      teamBefore,
      teamAfter,
      tookLead: moved && ra === 1 && rb > 1,
      lostLead: moved && rb === 1 && ra > 1,
      top3In: moved && ra <= 3 && rb > 3,
      top3Out: moved && ra > 3 && rb <= 3,
    };
    real[k] = e.total; // commit
  }

  const finalTotals = {};
  for (const t of teams) finalTotals[t.id] = teamTotal(t.id);

  // Newest first (approximated by round then hole — ESPN gives no hole time).
  const events = [...all]
    .sort((a, b) => b.round - a.round || b.hole - a.hole)
    .slice(0, 80)
    .map((e) => {
      const k = gkey(e.teamId, e.golfer);
      return {
        ...e,
        ...(enrich[`${k}|${e.round}|${e.hole}`] || {}),
        backToBack: b2b.has(`${k}|${e.round}|${e.hole}`),
      };
    });

  return NextResponse.json({
    events,
    teams: participants.map((p) => ({
      id: p.id,
      name: p.display_name,
      seed: p.draft_position,
      total: finalTotals[p.id] ?? null,
      series: seriesByTeam[p.id] || [],
    })),
    counting,
    baseline: 1 / (participants.length || 1),
    myTeamId: me?.id ?? null,
    updatedAt: new Date().toISOString(),
  });
}
