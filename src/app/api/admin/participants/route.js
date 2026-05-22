import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { display_name, user_id } = await request.json().catch(() => ({}));
  if (!display_name?.trim()) {
    return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: existing } = await db
    .from('participants')
    .select('draft_position')
    .order('draft_position', { ascending: false })
    .limit(1);
  const nextPos = (existing?.[0]?.draft_position ?? 0) + 1;

  const { data, error } = await db
    .from('participants')
    .insert({
      display_name: display_name.trim(),
      user_id: user_id || null,
      draft_position: nextPos,
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, participant: data });
}

export async function DELETE(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from('participants').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: participants } = await db
    .from('participants')
    .select('*')
    .order('draft_position');

  if (body.action === 'shuffle') {
    // Fisher–Yates over the draft positions.
    const ids = participants.map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    await applyOrder(db, ids);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'move') {
    const { id, direction } = body;
    const ordered = participants;
    const idx = ordered.findIndex((p) => p.id === id);
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swap < 0 || swap >= ordered.length) {
      return NextResponse.json({ ok: true }); // no-op at the ends
    }
    const ids = ordered.map((p) => p.id);
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    await applyOrder(db, ids);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

// Rewrites draft positions to match `ids` order. Uses a temporary offset to
// dodge the unique(draft_position) constraint during the shuffle.
async function applyOrder(db, ids) {
  for (let i = 0; i < ids.length; i++) {
    await db.from('participants').update({ draft_position: 1000 + i }).eq('id', ids[i]);
  }
  for (let i = 0; i < ids.length; i++) {
    await db.from('participants').update({ draft_position: i + 1 }).eq('id', ids[i]);
  }
}
