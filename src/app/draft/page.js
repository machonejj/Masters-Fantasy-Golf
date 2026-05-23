'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { Loading, PageHeader } from '@/app/page';
import {
  snakePicker,
  totalPicks,
  isDraftComplete,
  upcomingPicks,
} from '@/lib/draft';
import { teamColor } from '@/lib/teamColors';

function fmtClock(secs) {
  if (secs == null || secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function DraftPage() {
  const { loading, user, profile, settings, participants, golfers, picks, refresh } =
    usePoolData({ pollMs: 5000 });

  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const tickGuard = useRef(0);

  // 1-second clock for the countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const draftState = settings; // draft_state row holds status + settings
  const status = draftState?.status;
  const gpt = draftState?.golfers_per_team ?? 6;

  const myParticipant = useMemo(
    () => participants.find((p) => p.user_id === user?.id) || null,
    [participants, user]
  );

  const complete =
    draftState && isDraftComplete(draftState, participants, gpt);
  const onClock = useMemo(
    () =>
      draftState && !complete
        ? snakePicker(draftState.current_pick, participants)
        : null,
    [draftState, participants, complete]
  );

  const isMyTurn = onClock && myParticipant && onClock.id === myParticipant.id;

  const remaining = useMemo(() => {
    if (status !== 'active' || !draftState?.pick_deadline) return null;
    return Math.round((new Date(draftState.pick_deadline).getTime() - now) / 1000);
  }, [status, draftState, now]);

  // When the clock hits zero, nudge the server to auto-pick (idempotent, throttled).
  useEffect(() => {
    if (status !== 'active' || complete) return;
    if (remaining !== null && remaining <= 0 && Date.now() - tickGuard.current > 4000) {
      tickGuard.current = Date.now();
      fetch('/api/draft/tick', { method: 'POST' }).then(() => refresh());
    }
  }, [remaining, status, complete, refresh]);

  // Keep the auto-pick alive while the page is open even with no interaction.
  useEffect(() => {
    if (status !== 'active') return;
    const t = setInterval(() => {
      fetch('/api/draft/tick', { method: 'POST' }).then((r) => {
        if (r.ok) r.json().then((d) => d?.advanced && refresh());
      });
    }, 5000);
    return () => clearInterval(t);
  }, [status, refresh]);

  const takenIds = useMemo(() => new Set(picks.map((p) => p.golfer_id)), [picks]);
  const available = useMemo(
    () =>
      golfers
        .filter((g) => !takenIds.has(g.id))
        .filter((g) => g.name.toLowerCase().includes(search.toLowerCase())),
    [golfers, takenIds, search]
  );

  async function draftGolfer(golferId) {
    setError('');
    setPicking(true);
    try {
      const res = await fetch('/api/draft/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ golferId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pick failed');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPicking(false);
    }
  }

  if (loading) return <Loading />;

  const total = totalPicks(participants, gpt);
  const upcoming = draftState
    ? upcomingPicks(draftState.current_pick, participants, gpt, 6)
    : [];

  return (
    <div>
      <PageHeader title="Draft Room" subtitle={draftState?.tournament_name} />

      {/* ── Status banner ─────────────────────────────────────────── */}
      {status === 'pending' && (
        <div className="card text-center">
          <p className="text-gray-600">
            The draft hasn’t started yet. Hang tight — the admin will kick it off.
          </p>
        </div>
      )}
      {status === 'paused' && (
        <div className="card bg-masters-gold-pale border-masters-gold text-center">
          <p className="font-semibold text-masters-green">⏸ Draft paused by the admin.</p>
        </div>
      )}
      {complete && (
        <div className="card bg-masters-green text-white text-center">
          <p className="font-serif text-lg">🏆 The draft is complete!</p>
          <p className="text-white/70 text-sm">Head to Standings to follow the action.</p>
        </div>
      )}

      {status === 'active' && !complete && onClock && (
        <div
          className={`card mb-5 flex items-center justify-between ${
            isMyTurn ? 'bg-masters-gold-pale border-2 border-masters-gold animate-turn' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Pick {draftState.current_pick + 1} of {total} · Round{' '}
              {Math.floor(draftState.current_pick / Math.max(participants.length, 1)) + 1}
            </div>
            {isMyTurn ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-masters-gold text-masters-green text-xs font-extrabold uppercase tracking-wider animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-masters-green" /> Your turn
                </span>
                <span className="font-serif text-xl text-masters-green hidden sm:inline">
                  You&apos;re on the clock!
                </span>
              </div>
            ) : (
              <div className="font-serif text-xl text-masters-green flex items-center gap-2 mt-0.5">
                <span className={`w-2.5 h-2.5 rounded-full ${teamColor(onClock.draft_position).dot}`} />
                <span className={teamColor(onClock.draft_position).text}>{onClock.display_name}</span>
                <span className="text-gray-400 text-base font-sans">is picking…</span>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div
              className={`font-serif text-3xl font-bold tabular-nums ${
                remaining !== null && remaining <= 60 ? 'text-score-over' : 'text-masters-green'
              }`}
            >
              {fmtClock(remaining)}
            </div>
            <div className="text-[11px] text-gray-400">auto-picks best available</div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-800 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
      )}

      {/* ── Snake order on deck ───────────────────────────────────── */}
      {status === 'active' && !complete && upcoming.length > 0 && (
        <div className="card mb-5">
          <div className="card-title">On Deck</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {upcoming.map(({ pickIndex, participant }) => {
              const c = teamColor(participant?.draft_position);
              const current = pickIndex === draftState.current_pick;
              return (
                <div
                  key={pickIndex}
                  className={`shrink-0 px-3 py-2 rounded-lg text-center border ${
                    current
                      ? 'bg-masters-green text-white border-masters-green animate-turn'
                      : `${c.bg} ${c.text} ${c.border}`
                  }`}
                >
                  <div className="text-[10px] opacity-70">#{pickIndex + 1}</div>
                  <div className="text-xs font-semibold whitespace-nowrap">
                    {participant?.display_name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!complete && (
      <div className="grid md:grid-cols-2 gap-5">
        {/* ── Available golfers ───────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Available Golfers ({available.length})</div>
          {(isMyTurn || profile?.is_admin) && status === 'active' && !complete ? (
            <p className="text-xs text-masters-green-mid mb-3">
              {isMyTurn ? 'Tap a golfer to draft them.' : 'Admin: you can pick on behalf of anyone.'}
            </p>
          ) : (
            status === 'active' &&
            !complete && (
              <p className="text-xs text-gray-400 mb-3">Waiting for your turn…</p>
            )
          )}
          <input
            className="input mb-3"
            placeholder="Search golfers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-[460px] overflow-y-auto -mx-1 px-1">
            {available.map((g) => {
              const canPick =
                status === 'active' && !complete && (isMyTurn || profile?.is_admin);
              return (
                <div
                  key={g.id}
                  className="flex items-center justify-between py-2 border-b border-masters-green-light/60 last:border-0"
                >
                  <div className="min-w-0">
                    <span className="text-xs text-gray-400 mr-2">#{g.rank ?? '–'}</span>
                    <span className="font-medium">{g.name}</span>
                    {g.odds && <span className="text-xs text-gray-400 ml-2">{g.odds}</span>}
                  </div>
                  {canPick && (
                    <button
                      disabled={picking}
                      onClick={() => draftGolfer(g.id)}
                      className="btn-gold btn-sm"
                    >
                      Draft
                    </button>
                  )}
                </div>
              );
            })}
            {available.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No golfers match.</p>
            )}
          </div>
        </div>

        {/* ── Draft board / pick log ──────────────────────────────── */}
        <div className="card">
          <div className="card-title">Draft Board</div>
          <div className="max-h-[520px] overflow-y-auto -mx-1 px-1">
            {participants.length === 0 && (
              <p className="text-sm text-gray-400">No participants yet.</p>
            )}
            {participants.map((p) => {
              const c = teamColor(p.draft_position);
              const isMe = myParticipant?.id === p.id;
              const isOnClock = onClock?.id === p.id && status === 'active' && !complete;
              const roster = picks
                .filter((pk) => pk.participant_id === p.id)
                .map((pk) => golfers.find((g) => g.id === pk.golfer_id))
                .filter(Boolean);
              return (
                <div
                  key={p.id}
                  className={`mb-3 pl-2 border-l-4 ${c.borderL} ${
                    isOnClock ? 'bg-masters-gold-pale rounded-r-lg py-1' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                      <span className="text-gray-400">{p.draft_position}.</span>
                      <span className={`truncate ${c.text}`}>{p.display_name}</span>
                      {isMe && (
                        <span className="chip bg-masters-gold-light text-masters-green">you</span>
                      )}
                      {isOnClock && (
                        <span className="chip bg-masters-gold text-masters-green animate-pulse">
                          picking
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {roster.length}/{gpt}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {roster.map((g) => (
                      <span key={g.id} className={`chip ${c.bg} ${c.text}`}>
                        {g.name}
                      </span>
                    ))}
                    {Array.from({ length: Math.max(0, gpt - roster.length) }).map((_, i) => (
                      <span
                        key={i}
                        className="chip bg-gray-50 text-gray-300 border border-dashed border-gray-200"
                      >
                        empty
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
