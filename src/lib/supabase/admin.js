import { createClient } from '@supabase/supabase-js';

// Service-role client. Bypasses RLS — ONLY ever import this from server-side
// API route handlers, never from a client component. All draft and admin
// writes go through here after the route validates the caller.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
