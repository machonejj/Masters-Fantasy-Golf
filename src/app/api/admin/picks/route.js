import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// Admin-only: replace a single drafted golfer with an undrafted one, in place.
// Used when a golfer withdraws after the draft — the team keeps the same roster
// slot and pick number, so the rest of the draft is untouched (no re-draft).
export async function POST(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { pickId, newGolferId } = await request.json().catch(() => ({}));
  if (!pickId || !newGolferId) {
    return NextResponse.json({ error: 'pickId and newGolferId are required.' }, { status: 400 });
  }

  const db = createAdminClient();

  // Don't allow swaps while a draft is mid-flight — replacements are a post-draft move.
  const { data: state } = await db.from('draft_state').select('status').eq('id', 1).maybeSingle();
  if (state?.status === 'active' || state?.status === 'paused') {
    return NextResponse.json({ error: 'Finish the draft before making replacements.' }, { status: 409 });
  }

  const { data: pick } = await db.from('picks').select('*').eq('id', pickId).maybeSingle();
  if (!pick) return NextResponse.json({ error: 'That pick no longer exists.' }, { status: 404 });
  if (pick.golfer_id === newGolferId) {
    return NextResponse.json({ error: 'Choose a different golfer.' }, { status: 400 });
  }

  const { data: newGolfer } = await db
    .from('golfers')
    .select('id')
    .eq('id', newGolferId)
    .maybeSingle();
  if (!newGolfer) return NextResponse.json({ error: 'Replacement golfer not found.' }, { status: 404 });

  // A golfer can only be on one team. (The unique index enforces this too; this
  // is just for a friendlier message.)
  const { data: already } = await db
    .from('picks')
    .select('id')
    .eq('golfer_id', newGolferId)
    .maybeSingle();
  if (already) {
    return NextResponse.json({ error: 'That golfer is already on a team.' }, { status: 409 });
  }

  const { error } = await db.from('picks').update({ golfer_id: newGolferId }).eq('id', pickId);
  if (error) {
    return NextResponse.json(
      { error: 'Replacement failed — that golfer may have just been taken.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
