import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const { action } = body;
  const db = createAdminClient();

  const { data: state } = await db.from('draft_state').select('*').eq('id', 1).maybeSingle();
  if (!state) return NextResponse.json({ error: 'Draft state missing.' }, { status: 500 });

  const now = Date.now();

  switch (action) {
    case 'start': {
      // Begins (or restarts) the clock from the current pick.
      const { count } = await db
        .from('participants')
        .select('id', { count: 'exact', head: true });
      if (!count) {
        return NextResponse.json(
          { error: 'Add participants before starting the draft.' },
          { status: 400 }
        );
      }
      await db
        .from('draft_state')
        .update({
          status: 'active',
          // No timer (0) → no clock; picks have unlimited time.
          pick_deadline:
            state.pick_timer_seconds > 0
              ? new Date(now + state.pick_timer_seconds * 1000).toISOString()
              : null,
          paused_remaining_seconds: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      break;
    }

    case 'pause': {
      const remaining = state.pick_deadline
        ? Math.max(0, Math.round((new Date(state.pick_deadline).getTime() - now) / 1000))
        : state.pick_timer_seconds;
      await db
        .from('draft_state')
        .update({
          status: 'paused',
          paused_remaining_seconds: remaining,
          pick_deadline: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      break;
    }

    case 'resume': {
      const remaining = state.paused_remaining_seconds ?? state.pick_timer_seconds;
      await db
        .from('draft_state')
        .update({
          status: 'active',
          pick_deadline:
            state.pick_timer_seconds > 0
              ? new Date(now + remaining * 1000).toISOString()
              : null,
          paused_remaining_seconds: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      break;
    }

    case 'undo': {
      // Remove the most recent pick: frees that golfer and rewinds the clock so
      // the same team is back on the clock. Reopens a completed draft.
      const { data: lastPick } = await db
        .from('picks')
        .select('*')
        .order('pick_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastPick) {
        return NextResponse.json({ error: 'No picks to undo.' }, { status: 400 });
      }
      await db.from('picks').delete().eq('id', lastPick.id);
      await db
        .from('draft_state')
        .update({
          status: 'active',
          current_pick: lastPick.pick_number,
          pick_deadline:
            state.pick_timer_seconds > 0
              ? new Date(now + state.pick_timer_seconds * 1000).toISOString()
              : null,
          paused_remaining_seconds: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      break;
    }

    case 'reset': {
      await db.from('picks').delete().neq('pick_number', -1); // delete all
      await db
        .from('draft_state')
        .update({
          status: 'pending',
          current_pick: 0,
          pick_deadline: null,
          paused_remaining_seconds: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      break;
    }

    case 'settings': {
      const allowed = [
        'golfers_per_team',
        'counting_scores',
        'cut_penalty',
        'course_par',
        'pick_timer_seconds',
        'tournament_name',
      ];
      const patch = { updated_at: new Date().toISOString() };
      for (const k of allowed) {
        if (body.settings?.[k] !== undefined) patch[k] = body.settings[k];
      }
      await db.from('draft_state').update(patch).eq('id', 1);
      break;
    }

    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const { data: updated } = await db.from('draft_state').select('*').eq('id', 1).maybeSingle();
  return NextResponse.json({ ok: true, state: updated });
}
