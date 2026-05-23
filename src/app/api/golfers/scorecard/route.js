import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { fetchEspnLeaderboard, fetchEspnScorecard } from '@/lib/espn';
import { getActiveEventId } from '@/lib/activeEvent';

// Per-player scorecard for the detail modal: tournament/course meta plus the
// player's round + hole-by-hole breakdown. Read-only; any signed-in user.
export async function GET(request) {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const sp = new URL(request.url).searchParams;
  const athleteIdParam = sp.get('athleteId');
  const nameParam = sp.get('name');
  if (!athleteIdParam && !nameParam) {
    return NextResponse.json({ error: 'athleteId or name required' }, { status: 400 });
  }

  try {
    const board = await fetchEspnLeaderboard(await getActiveEventId());
    if (!board.eventId || !board.competitionId) {
      return NextResponse.json({ error: 'No live event right now.' }, { status: 404 });
    }
    // Resolve by ESPN id when we have it, otherwise match the player by name.
    const comp = athleteIdParam
      ? board.competitors.find((c) => String(c.athleteId) === String(athleteIdParam))
      : board.competitors.find((c) => c.name.toLowerCase() === nameParam.toLowerCase());
    const athleteId = athleteIdParam || comp?.athleteId;
    if (!athleteId) {
      return NextResponse.json({ error: 'Player not in the live field.' }, { status: 404 });
    }
    const card = await fetchEspnScorecard(athleteId, board.eventId, board.competitionId);

    return NextResponse.json({
      tournament: board.tournament,
      course: board.course,
      dates: board.dates,
      coursePar: board.coursePar,
      total: comp?.total ?? null,
      status: comp?.status ?? null,
      rounds: card.rounds,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Scorecard unavailable.' },
      { status: 502 }
    );
  }
}
