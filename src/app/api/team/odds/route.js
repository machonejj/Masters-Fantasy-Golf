import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchEspnLeaderboard, fetchEspnScorecard } from '@/lib/espn';
import { teamWinSeries } from '@/lib/winProbability';

// Cumulative to-par after each hole, from a player's ESPN scorecard.
function cumFromHoles(card) {
  const cum = [0];
  let acc = 0;
  for (const rd of [...(card.rounds || [])].sort((a, b) => a.round - b.round)) {
    for (const h of rd.holes) {
      acc += h.toPar;
      cum.push(acc);
    }
  }
  return { cum, holesPlayed: cum.length - 1 };
}

// Fallback when there's no hole data: spread each round's to-par across 18 holes.
function cumFromRounds(g) {
  const cum = [0];
  let acc = 0;
  for (const r of [g.r1, g.r2, g.r3, g.r4]) {
    if (r === null || r === undefined || r === '') break;
    const per = Number(r) / 18;
    for (let h = 0; h < 18; h++) {
      acc += per;
      cum.push(acc);
    }
  }
  return { cum, holesPlayed: cum.length - 1 };
}

// Hole-by-hole win-probability line for the signed-in user's team.
export async function GET() {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const db = createAdminClient();
  const [{ data: state }, { data: participants }, { data: picks }, { data: golfers }] =
    await Promise.all([
      db.from('draft_state').select('counting_scores, cut_penalty').eq('id', 1).maybeSingle(),
      db.from('participants').select('id, user_id'),
      db.from('picks').select('participant_id, golfer_id'),
      db.from('golfers').select('id, name, r1, r2, r3, r4, status'),
    ]);

  const me = (participants || []).find((p) => p.user_id === ctx.user.id);
  if (!me) return NextResponse.json({ series: [], reason: 'no-team' });
  if (!participants?.length || !picks?.length) {
    return NextResponse.json({ series: [], reason: 'no-draft' });
  }

  let board = null;
  try {
    board = await fetchEspnLeaderboard();
  } catch {
    /* fall back to stored rounds below */
  }
  const athleteByName = new Map(
    (board?.competitors || []).map((c) => [c.name.toLowerCase(), c.athleteId])
  );
  const golferById = new Map((golfers || []).map((g) => [g.id, g]));
  const draftedIds = [...new Set((picks || []).map((p) => p.golfer_id))];

  // Pull each drafted golfer's hole-by-hole in parallel (fall back to rounds).
  const seqByGolfer = {};
  await Promise.all(
    draftedIds.map(async (gid) => {
      const g = golferById.get(gid);
      if (!g) return;
      const aid = board?.eventId ? athleteByName.get(g.name.toLowerCase()) : null;
      if (!aid) {
        seqByGolfer[gid] = cumFromRounds(g);
        return;
      }
      try {
        const card = await fetchEspnScorecard(aid, board.eventId, board.competitionId);
        const seq = cumFromHoles(card);
        seqByGolfer[gid] = seq.holesPlayed > 0 ? seq : cumFromRounds(g);
      } catch {
        seqByGolfer[gid] = cumFromRounds(g);
      }
    })
  );

  const teams = (participants || []).map((p) => ({
    id: p.id,
    golfers: (picks || [])
      .filter((pk) => pk.participant_id === p.id)
      .map((pk) => {
        const g = golferById.get(pk.golfer_id);
        const seq = seqByGolfer[pk.golfer_id] || { cum: [0], holesPlayed: 0 };
        return { cum: seq.cum, holesPlayed: seq.holesPlayed, status: g?.status || 'active' };
      }),
  }));

  const series = teamWinSeries(teams, me.id, {
    counting: state?.counting_scores ?? 3,
    cutPenalty: state?.cut_penalty ?? 16,
    sims: 800,
  });

  return NextResponse.json({
    series,
    baseline: 1 / (participants.length || 1),
    teamCount: participants.length,
    updatedAt: new Date().toISOString(),
  });
}
