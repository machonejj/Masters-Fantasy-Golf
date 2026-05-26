import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computePurse, rankByScore, computePayouts } from '@/lib/gallery';

// Admin-only: close the active tournament and preserve it in The Gallery.
// The client sends the final standings it already computed for the leaderboard
// (each team's to-par + per-golfer final status); the server owns the money
// (purse from draft_state, payouts by structure) and writes the snapshot once.
export async function POST(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { standings } = await request.json().catch(() => ({}));
  if (!Array.isArray(standings) || standings.length === 0) {
    return NextResponse.json({ error: 'No standings to record.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: state } = await db.from('draft_state').select('*').eq('id', 1).maybeSingle();
  if (!state) return NextResponse.json({ error: 'No active tournament.' }, { status: 400 });

  if (state.status !== 'complete') {
    return NextResponse.json(
      { error: 'Finish the draft before closing the tournament.' },
      { status: 409 }
    );
  }
  if (state.closed_at) {
    return NextResponse.json(
      { error: 'This tournament is already in The Gallery. Set up a new tournament to start the next one.' },
      { status: 409 }
    );
  }

  // Money is computed server-side from the saved purse log — never trusted from
  // the client. Rank by the sent to-par, then split the purse by structure.
  const purse = computePurse(state.buy_in, state.paid_count);
  const ranked = rankByScore(
    standings.map((s) => ({
      participant_id: s.participant_id ?? null,
      name: s.name ?? '—',
      score: s.score ?? null,
      golfers: Array.isArray(s.golfers) ? s.golfers : [],
    }))
  );
  const paid = computePayouts(ranked, purse, state.payout_structure);
  const champion = paid.find((r) => r.position === 1) || null;

  const { data: row, error } = await db
    .from('tournaments')
    .insert({
      event_id: state.event_id,
      name: state.tournament_name || 'Tournament',
      course_par: state.course_par,
      counting_scores: state.counting_scores,
      golfers_per_team: state.golfers_per_team,
      buy_in: state.buy_in,
      paid_count: state.paid_count,
      purse,
      payout_structure: state.payout_structure,
      notes: state.purse_notes,
      champion_participant_id: champion?.participant_id ?? null,
      champion_name: champion?.name ?? null,
      standings: paid,
    })
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Mark the active tournament closed so it can't be added twice. setupTournament
  // clears this when the next tournament is loaded.
  await db.from('draft_state').update({ closed_at: new Date().toISOString() }).eq('id', 1);

  return NextResponse.json({ ok: true, tournament: row, champion: champion?.name ?? null, purse });
}
