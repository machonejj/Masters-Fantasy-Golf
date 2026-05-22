'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName || email.split('@')[0] } },
        });
        if (error) throw error;
        // If email confirmation is off, a session is returned immediately.
        if (data.session) {
          router.push('/');
          router.refresh();
        } else {
          setInfo('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-masters-green flex items-start justify-center overflow-y-auto px-5 pt-16">
      <div className="w-full max-w-sm bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 shadow-2xl">
        <div className="text-center mb-5">
          <span className="text-4xl block mb-1">⛳</span>
          <h1 className="font-serif text-2xl text-white">Masters Fantasy Golf</h1>
          <p className="text-[11px] text-white/60 uppercase tracking-wider mt-1">
            Snake Draft · Best 3 of 6
          </p>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-white/20 mb-5">
          {['signin', 'signup'].map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError('');
                setInfo('');
              }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                mode === m ? 'bg-masters-gold text-masters-green' : 'text-white/70'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="label text-white/70">Display Name</label>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jake M."
              />
            </div>
          )}
          <div>
            <label className="label text-white/70">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label text-white/70">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-100 text-red-800 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {info && (
            <div className="bg-emerald-100 text-emerald-800 text-sm rounded-lg px-3 py-2">
              {info}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-gold w-full">
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-[11px] text-white/50 mt-5">
          The first account created becomes the pool admin.
        </p>
      </div>
    </div>
  );
}
