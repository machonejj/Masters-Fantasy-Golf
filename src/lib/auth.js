import { createClient } from '@/lib/supabase/server';

// Resolves the logged-in user + their profile from the request cookies.
// Returns { user, profile } or { user: null } when not signed in.
export async function getSessionContext() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return { user, profile };
}

export async function requireUser() {
  const ctx = await getSessionContext();
  if (!ctx.user) {
    return { error: 'Not authenticated', status: 401 };
  }
  return ctx;
}

export async function requireAdmin() {
  const ctx = await getSessionContext();
  if (!ctx.user) {
    return { error: 'Not authenticated', status: 401 };
  }
  if (!ctx.profile?.is_admin) {
    return { error: 'Admin access required', status: 403 };
  }
  return ctx;
}
