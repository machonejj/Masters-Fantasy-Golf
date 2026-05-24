import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { codeFromName, playerEmail } from '@/lib/access-codes';

// GET — admin only: each participant's login code, read from the hidden
// Supabase account's metadata. Codes live there (never on the world-readable
// participants table) so one player can't read another's code.
export async function GET() {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const db = createAdminClient();
  const { data: parts } = await db.from('participants').select('id, user_id');
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });

  const codeByUser = new Map(
    (list?.users || []).map((u) => [u.id, u.user_metadata?.login_code || null])
  );
  const codes = {};
  for (const p of parts || []) {
    codes[p.id] = p.user_id ? codeByUser.get(p.user_id) || null : null;
  }
  return NextResponse.json({ codes });
}

// POST — admin only: create a player. Spins up a hidden Supabase account whose
// password is a freshly generated code, then links a participant to it. Returns
// the code so the admin can share it.
export async function POST(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { display_name } = await request.json().catch(() => ({}));
  const name = display_name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'A player name is required.' }, { status: 400 });
  }

  const db = createAdminClient();

  // Create the account with a memorable initials+digit code (e.g. "JM5"),
  // retrying on collision. Since initials+one-digit gives only 9 variants, the
  // later attempts add a second digit so repeated initials still resolve.
  let code;
  let user;
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    code = codeFromName(name, attempt >= 5);
    const { data, error } = await db.auth.admin.createUser({
      email: playerEmail(code),
      password: code,
      email_confirm: true,
      user_metadata: { display_name: name, login_code: code, role: 'player' },
    });
    if (!error) {
      user = data.user;
      break;
    }
    lastErr = error;
    // Collision → try a new code; any other failure → give up.
    if (!/registered|already|exists|duplicate/i.test(error.message || '')) break;
  }
  if (!user) {
    return NextResponse.json(
      { error: lastErr?.message || 'Could not create the player account.' },
      { status: 400 }
    );
  }

  // Players are never admins. The new-user trigger auto-admins the very first
  // profile, so force this off in case the admin account doesn't exist yet.
  await db.from('profiles').update({ is_admin: false }).eq('id', user.id);

  // The new-user trigger created the profile; link a participant to it.
  const { data: existing } = await db
    .from('participants')
    .select('draft_position')
    .order('draft_position', { ascending: false })
    .limit(1);
  const nextPos = (existing?.[0]?.draft_position ?? 0) + 1;

  const { data: participant, error } = await db
    .from('participants')
    .insert({ display_name: name, user_id: user.id, draft_position: nextPos })
    .select()
    .maybeSingle();

  if (error) {
    // Roll back the orphaned account so the admin can retry cleanly.
    await db.auth.admin.deleteUser(user.id).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, participant, code });
}

export async function DELETE(request) {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createAdminClient();
  const { data: part } = await db
    .from('participants')
    .select('user_id')
    .eq('id', id)
    .maybeSingle();

  const { error } = await db.from('participants').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Remove the hidden player account too — but never the admin.
  if (part?.user_id) {
    const { data: u } = await db.auth.admin.getUserById(part.user_id);
    if (u?.user?.user_metadata?.role === 'player') {
      await db.auth.admin.deleteUser(part.user_id).catch(() => {});
    }
  }
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
