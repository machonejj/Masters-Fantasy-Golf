// SERVER-ONLY. Reads the pool from the DB and pulls each drafted golfer's
// hole-by-hole from ESPN, returning everything the odds chart and the live feed
// need — fetched once so a page can build both without double-hitting ESPN.
import { createAdminClient } from './supabase/admin';
import { fetchEspnLeaderboard, fetchEspnScorecard } from './espn';
import { activeParticipants } from './draft';

export async function buildPoolLive(userId) {
  const db = createAdminClient();
  const [{ data: allParticipants }, { data: settings }, { data: picks }, { data: golfers }] =
    await Promise.all([
      // select('*') (not an explicit column list) so the query still works
      // before the sitting_out migration runs — activeParticipants treats a
      // missing/undefined flag as "active".
      db.from('participants').select('*'),
      db.from('draft_state').select('*').eq('id', 1).maybeSingle(),
      db.from('picks').select('participant_id, golfer_id'),
      db.from('golfers').select('id, name, r1, r2, r3, r4, status'),
    ]);

  // Players sitting out this tournament have no team — drop them from standings,
  // the feed, and the win-probability field.
  const participants = activeParticipants(allParticipants || []);

  const me = participants.find((p) => p.user_id === userId) || null;
  if (!participants.length || !picks?.length) {
    return { settings, participants, me, teams: [] };
  }

  let board = null;
  try {
    board = await fetchEspnLeaderboard(settings?.event_id ?? null);
  } catch {
    /* fall back to stored rounds */
  }
  const athleteByName = new Map(
    (board?.competitors || []).map((c) => [c.name.toLowerCase(), c.athleteId])
  );
  const compByName = new Map(
    (board?.competitors || []).map((c) => [c.name.toLowerCase(), c])
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

  function golferData(g) {
    const card = cardByGolfer[g.id];
    const comp = compByName.get(g.name.toLowerCase());

    // Hole-by-hole list for the live feed — from the detailed scorecard.
    const holes = [];
    if (card?.rounds?.length) {
      let acc = 0;
      for (const rd of [...card.rounds].sort((a, b) => a.round - b.round)) {
        for (const h of rd.holes) {
          acc += h.toPar;
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
    }

    // Cumulative to-par + holes played for the win-prob chart, built from the
    // LIVE leaderboard (per-round to-par + current-round `thru`). The leaderboard
    // tracks the field in real time, whereas the detailed scorecard lags and can
    // stall the chart between days/rounds. Each round's to-par is spread evenly
    // across its holes (an approximation that's fine for the projection); falls
    // back to the stored rounds when the live feed is unavailable.
    const rounds =
      comp?.rounds && comp.rounds.length
        ? comp.rounds.map((rt, i) => {
            const isCurrent = i === comp.rounds.length - 1;
            const holesIn = isCurrent && /^\d+$/.test(String(comp.thru)) ? Number(comp.thru) : 18;
            return { rt, holesIn };
          })
        : [g.r1, g.r2, g.r3, g.r4]
            .filter((r) => r !== null && r !== undefined && r !== '')
            .map((r) => ({ rt: Number(r), holesIn: 18 }));

    const cum = [0];
    let acc = 0;
    for (const { rt, holesIn } of rounds) {
      if (rt === null || rt === undefined || holesIn <= 0) break;
      const per = rt / holesIn;
      for (let h = 0; h < holesIn; h++) {
        acc += per;
        cum.push(acc);
      }
    }

    return {
      name: g.name,
      // Live leaderboard status (cut/wd/active) — the stored DB status lags and
      // would otherwise count cut golfers as active in the standings/odds.
      status: comp?.status ?? g.status,
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
