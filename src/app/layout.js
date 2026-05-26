import './globals.css';
import { createClient } from '@/lib/supabase/server';
import NavBar from '@/components/NavBar';
import SwipeNav from '@/components/SwipeNav';

export const metadata = {
  title: 'Augusta Pickem',
  description: 'Snake draft fantasy golf pool — best 3 of 6 count.',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#1a4d2e',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    profile = data;
  }

  return (
    <html lang="en">
      <body>
        {user && <NavBar profile={profile} />}
        <main className="max-w-5xl mx-auto px-4 py-6 overflow-x-clip">
          {user ? <SwipeNav isAdmin={!!profile?.is_admin}>{children}</SwipeNav> : children}
        </main>
      </body>
    </html>
  );
}
