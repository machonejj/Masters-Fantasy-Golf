import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildPoolLive } from '@/lib/poolLive';
import { allTeamWinSeries } from '@/lib/winProbability';

// Live feed of drafted golfers' holes (newest first) + the win-probability
// series, both from one set of ESPN fetches.
export async function GET() {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { settings, participants, me, teams } = await buildPoolLive(ctx.user.id);
  if (!teams.length) return NextResponse.json({ events: [], teams: [], reason: 'no-draft' });

  const seriesByTeam = allTeamWinSeries(teams, {
    counting: settings?.counting_scores ?? 3,
    cutPenalty: settings?.cut_penalty ?? 16,
    sims: 800,
  });

  const events = [];
  for (const t of teams) {
    for (const g of t.golfers) {
      for (const h of g.holes) {
        events.push({
          golfer: g.name,
          teamId: t.id,
          team: t.name,
          seed: t.seed,
          round: h.round,
          hole: h.hole,
          toPar: h.toPar,
          total: h.total,
        });
      }
    }
  }
  // Newest first (approximated by round then hole, since ESPN gives no per-hole time).
  events.sort((a, b) => b.round - a.round || b.hole - a.hole);

  return NextResponse.json({
    events: events.slice(0, 80),
    teams: participants.map((p) => ({
      id: p.id,
      name: p.display_name,
      seed: p.draft_position,
      series: seriesByTeam[p.id] || [],
    })),
    baseline: 1 / (participants.length || 1),
    myTeamId: me?.id ?? null,
    updatedAt: new Date().toISOString(),
  });
}
