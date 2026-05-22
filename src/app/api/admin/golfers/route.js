import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_GOLFERS } from '@/lib/golfers-seed';
import { fetchEspnLeaderboard } from '@/lib/espn';

export async function POST(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();

  if (body.action === 'seed') {
    const { count } = await db.from('golfers').select('id', { count: 'exact', head: true });
    if (count > 0) {
      return NextResponse.json(
        { error: 'The field already has golfers. Clear it first to reseed.' },
        { status: 409 }
      );
    }
    const rows = DEFAULT_GOLFERS.map((g) => ({ name: g.name, rank: g.rank, odds: g.odds }));
    const { error } = await db.from('golfers').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, inserted: rows.length });
  }

  if (body.action === 'add') {
    const { name, rank, odds } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Name required.' }, { status: 400 });
    const { data, error } = await db
      .from('golfers')
      .insert({ name: name.trim(), rank: rank ?? null, odds: odds ?? null })
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, golfer: data });
  }

  if (body.action === 'syncLive') {
    let board;
    try {
      board = await fetchEspnLeaderboard();
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const { data: golfers } = await db.from('golfers').select('*');
    const byName = new Map((golfers || []).map((g) => [g.name.toLowerCase(), g]));
    let updated = 0;
    for (const c of board.competitors) {
      const g = byName.get(c.name.toLowerCase());
      if (!g) continue;
      const patch = {
        status: c.status,
        thru: c.thru,
        today: c.score,
        r1: c.rounds[0] ?? g.r1,
        r2: c.rounds[1] ?? g.r2,
        r3: c.rounds[2] ?? g.r3,
        r4: c.rounds[3] ?? g.r4,
      };
      await db.from('golfers').update(patch).eq('id', g.id);
      updated++;
    }
    return NextResponse.json({ ok: true, updated, tournament: board.tournament });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

export async function PATCH(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id, r1, r2, r3, r4, status, rank, odds } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const patch = {};
  if (r1 !== undefined) patch.r1 = num(r1);
  if (r2 !== undefined) patch.r2 = num(r2);
  if (r3 !== undefined) patch.r3 = num(r3);
  if (r4 !== undefined) patch.r4 = num(r4);
  if (status !== undefined) patch.status = status;
  if (rank !== undefined) patch.rank = num(rank);
  if (odds !== undefined) patch.odds = odds;

  const db = createAdminClient();
  const { error } = await db.from('golfers').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const clearAll = searchParams.get('all') === 'true';
  const db = createAdminClient();

  if (clearAll) {
    const { count } = await db.from('picks').select('id', { count: 'exact', head: true });
    if (count > 0) {
      return NextResponse.json(
        { error: 'Reset the draft before clearing the field (golfers are drafted).' },
        { status: 409 }
      );
    }
    await db.from('golfers').delete().neq('name', '');
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { data: drafted } = await db
    .from('picks')
    .select('id')
    .eq('golfer_id', id)
    .maybeSingle();
  if (drafted) {
    return NextResponse.json({ error: 'That golfer has been drafted.' }, { status: 409 });
  }
  const { error } = await db.from('golfers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
