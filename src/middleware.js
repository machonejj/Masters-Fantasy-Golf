import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every route except:
     * - _next static/image assets
     * - favicon and image files
     * - /api routes (they validate auth themselves)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
