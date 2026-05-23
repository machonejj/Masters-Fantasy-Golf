// SERVER-ONLY. Reads the pool from the DB and pulls each drafted golfer's
// hole-by-hole from ESPN, returning everything the odds chart and the live feed
// need — fetched once so a page can build both without double-hitting ESPN.
import { createAdminClient } from './supabase/admin';
import { fetchEspnLeaderboard, fetchEspnScorecard } from './espn';

export async function buildPoolLive(userId) {
  const db = createAdminClient();
  const [{ data: settings }, { data: participants }, { data: picks }, { data: golfers }] =
    await Promise.all([
      db.from('draft_state').select('counting_scores, cut_penalty').eq('id', 1).maybeSingle(),
      db.from('participants').select('id, user_id, display_name, draft_position'),
      db.from('picks').select('participant_id, golfer_id'),
      db.from('golfers').select('id, name, r1, r2, r3, r4, status'),
    ]);

  const me = (participants || []).find((p) => p.user_id === userId) || null;
  if (!participants?.length || !picks?.length) {
    return { settings, participants: participants || [], me, teams: [] };
  }

  let board = null;
  try {
    board = await fetchEspnLeaderboard();
  } catch {
    /* fall back to stored rounds */
  }
  const athleteByName = new Map(
    (board?.competitors || []).map((c) => [c.name.toLowerCase(), c.athleteId])
  );
  const golferById = new Map((golfers || []).map((g) => [g.id, g]));

  // Pull each drafted golfer's scorecard once, in parallel.
  const cardByGolfer = {};
  await Promise.all(
    [...new Set(picks.map((p) => p.golfer_id))].map(async (gid) => {
      const g = golferById.get(gid);
      const aid = g && board?.eventId ? athleteByName.get(g.name.toLowerCase()) : null;
      if (!aid) return;
      try {
        cardByGolfer[gid] = await fetchEspnScorecard(aid, board.eventId, board.competitionId);
      } catch {
        /* ignore */
      }
    })
  );

  // Per-golfer cumulative to-par (for odds) + flattened played holes (for feed).
  function golferData(g) {
    const card = cardByGolfer[g.id];
    const cum = [0];
    const holes = [];
    let acc = 0;
    if (card?.rounds?.length) {
      for (const rd of [...card.rounds].sort((a, b) => a.round - b.round)) {
        for (const h of rd.holes) {
          acc += h.toPar;
          cum.push(acc);
          holes.push({
            round: rd.round,
            hole: h.hole,
            par: h.par,
            strokes: h.strokes,
            toPar: h.toPar,
            type: h.type,
            total: acc,
          });
        }
      }
    } else {
      for (const r of [g.r1, g.r2, g.r3, g.r4]) {
        if (r === null || r === undefined || r === '') break;
        const per = Number(r) / 18;
        for (let h = 0; h < 18; h++) {
          acc += per;
          cum.push(acc);
        }
      }
    }
    return {
      name: g.name,
      status: g.status,
      athleteId: athleteByName.get(g.name.toLowerCase()) ?? null,
      cum,
      holesPlayed: cum.length - 1,
      holes,
    };
  }

  const teams = (participants || []).map((p) => ({
    id: p.id,
    name: p.display_name,
    seed: p.draft_position,
    golfers: picks
      .filter((pk) => pk.participant_id === p.id)
      .map((pk) => golferById.get(pk.golfer_id))
      .filter(Boolean)
      .map(golferData),
  }));

  return { settings, participants: participants || [], me, teams };
}
