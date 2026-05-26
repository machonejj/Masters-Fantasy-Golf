import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { reseatChampion } from '@/lib/gallery';

// Admin-only edits to The Gallery archive.
//
//   PATCH  — set/override the champion of a completed tournament. The chosen team
//            moves to 1st, the rest re-rank by score, and the purse is re-split.
//   DELETE — remove a completed tournament from The Gallery.
export async function PATCH(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id, championKey } = await request.json().catch(() => ({}));
  if (!id || !championKey) {
    return NextResponse.json({ error: 'id and championKey are required.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: t } = await db.from('tournaments').select('*').eq('id', id).maybeSingle();
  if (!t) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });

  const result = reseatChampion(t.standings || [], championKey, t.purse, t.payout_structure);
  if (!result) return NextResponse.json({ error: 'That team is not in this tournament.' }, { status: 400 });

  const { error } = await db
    .from('tournaments')
    .update({
      standings: result.standings,
      champion_participant_id: result.champion.participant_id ?? null,
      champion_name: result.champion.name ?? null,
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, champion: result.champion.name });
}

export async function DELETE(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from('tournaments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
