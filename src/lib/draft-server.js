import { isDraftComplete } from '@/lib/draft';

// Advances the draft after a pick lands: marks it complete, or arms a fresh
// pick clock for the next person on the snake order. Shared by the pick and
// tick API routes. `db` is a service-role Supabase client.
export async function advanceDraft(db, state, participants) {
  const next = state.current_pick + 1;
  const done = isDraftComplete({ current_pick: next }, participants, state.golfers_per_team);

  const patch = { current_pick: next, updated_at: new Date().toISOString() };
  if (done) {
    patch.status = 'complete';
    patch.pick_deadline = null;
  } else {
    patch.pick_deadline = new Date(Date.now() + state.pick_timer_seconds * 1000).toISOString();
  }

  await db.from('draft_state').update(patch).eq('id', 1);
  return { current_pick: next, complete: done };
}
