'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const REMEMBER_KEY = 'poolCode';

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient()); // stable across renders

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(
    async (theCode) => {
      setError('');
      setBusy(true);
      try {
        // Resolve the code server-side into the hidden Supabase login.
        const res = await fetch('/api/auth/resolve-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: theCode }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Invalid code.');

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (signInError) {
          throw new Error("That code isn't valid. Double-check it with the pool admin.");
        }

        // Remember the code so a returning player is signed in automatically.
        try {
          localStorage.setItem(REMEMBER_KEY, theCode);
        } catch {}
        router.push(data.role === 'admin' ? '/admin' : '/team');
        router.refresh();
        return true;
      } catch (err) {
        setError(err.message || 'Something went wrong.');
        try {
          localStorage.removeItem(REMEMBER_KEY); // drop a stale/invalid remembered code
        } catch {}
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router, supabase]
  );

  // If we have a remembered code, silently sign back in (no typing needed).
  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem(REMEMBER_KEY);
    } catch {}
    if (saved) {
      setCode(saved);
      signIn(saved);
    }
  }, [signIn]);

  function handleSubmit(e) {
    e.preventDefault();
    signIn(code);
  }

  return (
    <div className="fixed inset-0 bg-masters-green flex items-start justify-center overflow-y-auto px-5 pt-16">
      {/* Background video + green tint, recreated from the original auth screen. */}
      <video
        className="fixed inset-0 h-full w-full object-cover z-0"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/auth-bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 z-[1] bg-[rgba(20,55,30,0.72)]" aria-hidden="true" />

      <div className="relative z-[2] w-full max-w-sm bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 shadow-2xl">
        <div className="text-center mb-6">
          <span className="text-4xl block mb-1">⛳</span>
          <h1 className="font-serif text-2xl text-white">Masters Fantasy Golf</h1>
          <p className="text-[11px] text-white/60 uppercase tracking-wider mt-1">
            Snake Draft · Best 3 of 6
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label text-white/70">Access code</label>
            <input
              required
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="input text-center tracking-[0.3em] uppercase font-mono text-lg"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
            />
          </div>

          {error && (
            <div className="bg-red-100 text-red-800 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={busy || !code.trim()} className="btn-gold w-full">
            {busy ? 'Checking…' : 'Enter Pool'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/10 space-y-1.5 text-[11px] text-white/50">
          <p>
            <span className="text-white/70 font-semibold">Players</span> — enter the code your
            pool admin gave you.
          </p>
          <p>
            <span className="text-white/70 font-semibold">Admin</span> — enter your admin code to
            manage the pool.
          </p>
        </div>
      </div>
    </div>
  );
}
