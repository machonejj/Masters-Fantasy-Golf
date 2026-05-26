import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { snakePicker, isDraftComplete, bestAvailableGolfer, activeParticipants } from '@/lib/draft';
import { advanceDraft } from '@/lib/draft-server';

// Core "clock check". Idempotent: only auto-picks when the active pick clock has
// actually expired. Shared by POST (a signed-in client poking it) and GET (cron).
async function runTick() {
  const db = createAdminClient();
  const [{ data: state }, { data: participants }, { data: picks }, { data: golfers }] =
    await Promise.all([
      db.from('draft_state').select('*').eq('id', 1).maybeSingle(),
      db.from('participants').select('*').order('draft_position'),
      db.from('picks').select('*').order('pick_number'),
      db.from('golfers').select('*'),
    ]);

  // Players sitting out this tournament aren't in the snake order.
  const active = activeParticipants(participants || []);

  if (!state || state.status !== 'active') {
    return { ok: true, advanced: false };
  }
  if (isDraftComplete(state, active, state.golfers_per_team)) {
    await db.from('draft_state').update({ status: 'complete', pick_deadline: null }).eq('id', 1);
    return { ok: true, advanced: false, complete: true };
  }

  const expired =
    state.pick_deadline && new Date(state.pick_deadline).getTime() <= Date.now();
  if (!expired) {
    return { ok: true, advanced: false };
  }

  const onClock = snakePicker(state.current_pick, active);
  const best = bestAvailableGolfer(golfers || [], picks || []);
  if (!onClock || !best) {
    return { ok: true, advanced: false };
  }

  const { error: insertErr } = await db.from('picks').insert({
    participant_id: onClock.id,
    golfer_id: best.id,
    pick_number: state.current_pick,
  });
  if (insertErr) {
    // Lost the race to a real pick — fine, state already moved on.
    return { ok: true, advanced: false };
  }

  const result = await advanceDraft(db, state, active);
  return {
    ok: true,
    advanced: true,
    autoPicked: { participant: onClock.display_name, golfer: best.name },
    ...result,
  };
}

// Any signed-in client can poke this; the Draft Room does so while open.
export async function POST() {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await runTick());
}

// Vercel Cron hits this on a schedule (see vercel.json) so timeouts resolve even
// with nobody watching. When CRON_SECRET is set, Vercel sends it as a Bearer
// token; we require it to match. If unset, the endpoint stays open (it can only
// advance an already-expired clock, the same as any logged-in user could).
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return NextResponse.json(await runTick());
}
