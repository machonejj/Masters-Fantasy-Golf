'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const TABS = [
  { href: '/', label: 'Standings' },
  { href: '/golfers', label: 'The Field' },
  { href: '/team', label: 'My Team' },
  { href: '/draft', label: 'Draft Room' },
];

export default function NavBar({ profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const tabs = profile?.is_admin
    ? [...TABS, { href: '/admin', label: 'Admin' }]
    : TABS;

  async function signOut() {
    try {
      localStorage.removeItem('poolCode'); // forget the remembered code on a real sign-out
    } catch {}
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="bg-masters-green sticky top-0 z-50">
      <div className="max-w-5xl mx-auto">
        {/* Brand + account */}
        <div className="flex items-center justify-between px-4 h-12">
          <Link href="/" className="flex items-center gap-2 text-white whitespace-nowrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/augusta-mark.png" alt="Augusta Pickem" className="h-7 w-auto" />
            <span className="font-masters text-base font-bold tracking-wide leading-none">
              Augusta Pickem
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-white/70">
              {profile?.display_name}
            </span>
            <button
              onClick={signOut}
              className="text-xs border border-white/20 text-white/70 px-2.5 py-1 rounded hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Tabs — evenly fill the width so they fit any screen */}
        <div className="flex border-t border-white/10">
          {tabs.map((t) => {
            const active =
              t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex-1 text-center py-2.5 text-[11px] sm:text-sm font-medium border-b-[3px] whitespace-nowrap transition-colors ${
                  active
                    ? 'text-white border-white font-bold'
                    : 'text-white/70 border-transparent hover:text-white hover:bg-white/5'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
