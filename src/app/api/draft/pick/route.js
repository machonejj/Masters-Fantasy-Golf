import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { snakePicker, isDraftComplete, activeParticipants } from '@/lib/draft';
import { advanceDraft } from '@/lib/draft-server';

export async function POST(request) {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { golferId } = await request.json().catch(() => ({}));
  if (!golferId) return NextResponse.json({ error: 'golferId required' }, { status: 400 });

  const db = createAdminClient();
  const [{ data: state }, { data: participants }, { data: picks }, { data: golfer }] =
    await Promise.all([
      db.from('draft_state').select('*').eq('id', 1).maybeSingle(),
      db.from('participants').select('*').order('draft_position'),
      db.from('picks').select('*').order('pick_number'),
      db.from('golfers').select('*').eq('id', golferId).maybeSingle(),
    ]);

  // Only players taking part this tournament are in the snake order; a player
  // who's sitting out is skipped entirely (and can't pick).
  const active = activeParticipants(participants || []);

  if (!state || state.status !== 'active') {
    return NextResponse.json({ error: 'The draft is not active.' }, { status: 409 });
  }
  if (isDraftComplete(state, active, state.golfers_per_team)) {
    return NextResponse.json({ error: 'The draft is complete.' }, { status: 409 });
  }
  if (!golfer) return NextResponse.json({ error: 'Golfer not found.' }, { status: 404 });
  if ((picks || []).some((p) => p.golfer_id === golferId)) {
    return NextResponse.json({ error: 'That golfer is already drafted.' }, { status: 409 });
  }

  const onClock = snakePicker(state.current_pick, active);
  if (!onClock) return NextResponse.json({ error: 'No participant on the clock.' }, { status: 409 });

  const myParticipant = active.find((p) => p.user_id === ctx.user.id);
  const isMyTurn = myParticipant && myParticipant.id === onClock.id;
  if (!isMyTurn && !ctx.profile?.is_admin) {
    return NextResponse.json({ error: "It's not your turn." }, { status: 403 });
  }

  const { error: insertErr } = await db.from('picks').insert({
    participant_id: onClock.id,
    golfer_id: golferId,
    pick_number: state.current_pick,
  });
  if (insertErr) {
    // Unique-index violation = someone just took this pick/golfer. Treat as a race.
    return NextResponse.json({ error: 'Pick conflict — try again.' }, { status: 409 });
  }

  const result = await advanceDraft(db, state, active);
  return NextResponse.json({ ok: true, advanced: true, ...result });
}
