// SERVER-ONLY. The ESPN event id the pool is currently set to (chosen via the
// admin tournament picker), or null to follow ESPN's current event. Reads the
// whole draft_state row so it degrades gracefully if the `event_id` column
// hasn't been added yet (returns null → current event).
import { createAdminClient } from './supabase/admin';

export async function getActiveEventId(db = null) {
  const client = db || createAdminClient();
  const { data } = await client.from('draft_state').select('*').eq('id', 1).maybeSingle();
  return data?.event_id ?? null;
}
