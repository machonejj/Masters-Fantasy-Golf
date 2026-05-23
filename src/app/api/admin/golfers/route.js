import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_GOLFERS } from '@/lib/golfers-seed';
import { fetchEspnLeaderboard, espnToParRounds } from '@/lib/espn';
import { getActiveEventId } from '@/lib/activeEvent';
import { fetchWorldRankings, normalizeName } from '@/lib/rankings';

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

  // Guided "set up next tournament": point the pool at a specific ESPN event,
  // reset the draft, clear the old field, and load the new event's field.
  if (body.action === 'setupTournament') {
    const eventId = String(body.eventId || '').trim();
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });

    let board;
    try {
      board = await fetchEspnLeaderboard(eventId);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    // Save the selection FIRST so that if the event_id column is missing we bail
    // before touching the existing draft/field (nothing destroyed).
    const { error: stateErr } = await db
      .from('draft_state')
      .update({
        event_id: eventId,
        status: 'pending',
        current_pick: 0,
        pick_deadline: null,
        paused_remaining_seconds: null,
        tournament_name: board.tournament || 'Tournament',
        course_par: board.coursePar || 72,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (stateErr) {
      return NextResponse.json(
        {
          error: `Couldn't save the tournament selection — add the draft_state.event_id column first (no data was changed). (${stateErr.message})`,
        },
        { status: 500 }
      );
    }

    // Order the field by world ranking (favorites first). Unranked players get
    // null rank → they sort to the bottom (matches usePoolData's nullsFirst:false).
    const owgr = await fetchWorldRankings();

    // Now reset the draft and swap in the new field.
    await db.from('picks').delete().neq('pick_number', -1);
    await db.from('golfers').delete().neq('name', '');
    const rows = board.competitors.map((c) => {
      const [r1, r2, r3, r4] = espnToParRounds(c);
      return {
        name: c.name,
        rank: owgr.get(normalizeName(c.name)) ?? null,
        status: c.status,
        thru: c.thru,
        today: c.score,
        r1,
        r2,
        r3,
        r4,
      };
    });
    if (rows.length) await db.from('golfers').insert(rows);

    return NextResponse.json({ ok: true, tournament: board.tournament, field: rows.length });
  }

  if (body.action === 'syncLive') {
    let board;
    try {
      board = await fetchEspnLeaderboard(await getActiveEventId(db));
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    const owgr = await fetchWorldRankings();
    const { data: golfers } = await db.from('golfers').select('*');
    const byName = new Map((golfers || []).map((g) => [g.name.toLowerCase(), g]));

    let updated = 0;
    const toInsert = [];
    for (const c of board.competitors) {
      const [r1, r2, r3, r4] = espnToParRounds(c);
      const patch = { status: c.status, thru: c.thru, today: c.score, r1, r2, r3, r4 };
      const g = byName.get(c.name.toLowerCase());
      if (g) {
        await db.from('golfers').update(patch).eq('id', g.id);
        updated++;
      } else {
        // New to the field — add them, ranked by world ranking (null if unranked).
        toInsert.push({ name: c.name, rank: owgr.get(normalizeName(c.name)) ?? null, ...patch });
      }
    }
    if (toInsert.length) await db.from('golfers').insert(toInsert);

    // Keep the pool's tournament name + par in step with the live event.
    const statePatch = {};
    if (board.tournament) statePatch.tournament_name = board.tournament;
    if (board.coursePar) statePatch.course_par = board.coursePar;
    if (Object.keys(statePatch).length) {
      await db.from('draft_state').update(statePatch).eq('id', 1);
    }

    return NextResponse.json({
      ok: true,
      updated,
      inserted: toInsert.length,
      tournament: board.tournament,
    });
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
