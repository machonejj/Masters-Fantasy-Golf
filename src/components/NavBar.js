'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const TABS = [
  { href: '/', label: 'Leaderboard' },
  { href: '/draft', label: 'Draft Room' },
  { href: '/team', label: 'My Team' },
  { href: '/golfers', label: 'Golfers' },
];

export default function NavBar({ profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const tabs = profile?.is_admin
    ? [...TABS, { href: '/admin', label: 'Admin' }]
    : TABS;

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="bg-masters-green sticky top-0 z-50">
      <div className="max-w-5xl mx-auto flex items-stretch min-h-[52px]">
        <Link
          href="/"
          className="px-4 flex flex-col justify-center border-r border-white/15 text-white whitespace-nowrap"
        >
          <span className="font-serif text-[15px] font-bold leading-tight">
            ⛳ Masters Fantasy
          </span>
          <span className="text-[10px] text-white/50 uppercase tracking-wide">
            Snake Draft Pool
          </span>
        </Link>

        <div className="flex flex-1 overflow-x-auto">
          {tabs.map((t) => {
            const active =
              t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex items-center justify-center px-3 sm:px-4 text-xs font-medium border-b-[3px] whitespace-nowrap transition-colors ${
                  active
                    ? 'text-white border-white font-bold'
                    : 'text-white/65 border-transparent hover:text-white hover:bg-white/5'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto px-4 flex items-center gap-3 border-l border-white/10">
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
    </nav>
  );
}
