import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildPoolLive } from '@/lib/poolLive';
import { allTeamWinSeries } from '@/lib/winProbability';

// All-teams hole-by-hole win-probability lines.
export async function GET() {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { settings, participants, me, teams } = await buildPoolLive(ctx.user.id);
  if (!teams.length) return NextResponse.json({ teams: [], reason: 'no-draft' });

  const seriesByTeam = allTeamWinSeries(teams, {
    counting: settings?.counting_scores ?? 3,
    sims: 800,
  });

  return NextResponse.json({
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
