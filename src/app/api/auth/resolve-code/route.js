import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { playerEmail, normalizePlayerCode, ADMIN_EMAIL } from '@/lib/access-codes';

// Turns a typed access code into the hidden Supabase credentials the browser
// then signs in with (so the normal session cookie / RLS / realtime all keep
// working). Returning these creds leaks nothing: they're derived from the code
// the caller already typed.
//
//   • Admin code  → the ADMIN_ACCESS_CODE server secret. Bootstraps the single
//     admin account on first use and keeps its password in sync (so changing
//     the env var rotates the admin login).
//   • Player code → derived player credentials. We don't verify existence here;
//     a wrong code simply fails the subsequent sign-in as "invalid code".
export async function POST(request) {
  const { code } = await request.json().catch(() => ({}));
  const raw = (code || '').trim();
  if (!raw) return NextResponse.json({ error: 'Enter your code.' }, { status: 400 });

  const adminCode = process.env.ADMIN_ACCESS_CODE;
  const db = createAdminClient();

  // ── Admin code ──────────────────────────────────────────────────────────
  // Case-insensitive so it works no matter how the login box renders/sends it.
  if (adminCode && raw.toUpperCase() === adminCode.trim().toUpperCase()) {
    if (adminCode.length < 6) {
      return NextResponse.json(
        { error: 'Admin code must be at least 6 characters. Update ADMIN_ACCESS_CODE.' },
        { status: 500 }
      );
    }

    const { data: list, error: listErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    let admin = (list?.users || []).find((u) => u.email === ADMIN_EMAIL);
    if (!admin) {
      const { data, error } = await db.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: adminCode,
        email_confirm: true,
        user_metadata: { display_name: 'Admin', role: 'admin' },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      admin = data.user;
    } else {
      // Keep the password matching the current env code.
      await db.auth.admin.updateUserById(admin.id, { password: adminCode });
    }

    // The new-user trigger only auto-admins the very first profile; make sure
    // this account is flagged admin regardless of signup order.
    await db.from('profiles').update({ is_admin: true }).eq('id', admin.id);

    return NextResponse.json({ role: 'admin', email: ADMIN_EMAIL, password: adminCode });
  }

  // ── Player code ─────────────────────────────────────────────────────────
  const playerCode = normalizePlayerCode(raw);
  return NextResponse.json({
    role: 'player',
    email: playerEmail(playerCode),
    password: playerCode,
  });
}
