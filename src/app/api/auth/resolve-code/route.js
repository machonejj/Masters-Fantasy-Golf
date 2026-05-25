import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  playerEmail,
  normalizePlayerCode,
  matchAdminCode,
  adminEmail,
  adminPassword,
  adminDisplayName,
} from '@/lib/access-codes';

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

  const db = createAdminClient();

  // ── Admin code(s) ─────────────────────────────────────────────────────────
  // ADMIN_ACCESS_CODE is comma-separated (e.g. "TOMMY,JAKE"); each code is its
  // own hidden admin account, so multiple admins can be logged in at once.
  // Case-insensitive so it works no matter how the login box sends it.
  const matchedAdmin = matchAdminCode(raw);
  if (matchedAdmin) {
    const email = adminEmail(matchedAdmin);
    const password = adminPassword(matchedAdmin); // derived, always ≥6 chars
    const name = adminDisplayName(matchedAdmin);

    const { data: list, error: listErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    let admin = (list?.users || []).find((u) => u.email === email);
    if (!admin) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name, role: 'admin' },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      admin = data.user;
    } else {
      // Keep the derived password + name in sync with the code.
      await db.auth.admin.updateUserById(admin.id, {
        password,
        user_metadata: { display_name: name, role: 'admin' },
      });
    }

    // The new-user trigger only auto-admins the very first profile; flag this
    // account admin regardless of signup order, and show its name.
    await db.from('profiles').update({ is_admin: true, display_name: name }).eq('id', admin.id);

    return NextResponse.json({ role: 'admin', email, password });
  }

  // ── Player code ─────────────────────────────────────────────────────────
  const playerCode = normalizePlayerCode(raw);
  return NextResponse.json({
    role: 'player',
    email: playerEmail(playerCode),
    password: playerCode,
  });
}
