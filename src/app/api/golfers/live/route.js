import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { fetchEspnLeaderboard } from '@/lib/espn';
import { getActiveEventId } from '@/lib/activeEvent';

// Read-only live leaderboard proxy (avoids browser CORS issues with ESPN).
export async function GET() {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const board = await fetchEspnLeaderboard(await getActiveEventId());
    return NextResponse.json(board);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Live feed unavailable.' },
      { status: 502 }
    );
  }
}
