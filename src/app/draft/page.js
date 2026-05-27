'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { Loading, PageHeader } from '@/app/page';
import { snakePicker, totalPicks, isDraftComplete, activeParticipants } from '@/lib/draft';
import { teamColor } from '@/lib/teamColors';
import { useLiveScores } from '@/lib/useLiveScores';
import PlayerProfileCard from '@/components/PlayerProfileCard';

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
  const [pickReveal, setPickReveal] = useState(null); // { name, team, seed, mine, athleteId }
  const [profilePlayer, setProfilePlayer] = useState(null); // golfer to scout in the card
  const tickGuard = useRef(0);
  const seenPickRef = useRef(null); // highest pick_number seen (null until first load)
  const pickSound = useRef(null); // sound effect played on each pick
  const audioCtxRef = useRef(null); // for the synthesized "your turn" chime
  const prevTurnRef = useRef(null); // tracks your-turn transitions (null until first load)

  // Live ESPN field gives each golfer's athleteId, used for the pick headshot.
  const { live } = useLiveScores();

  // Load the pick sound once (drop the file at public/pick.mp3). Missing/blocked
  // audio fails silently, so the draft still works without it.
  useEffect(() => {
    pickSound.current = new Audio('/pick.mp3');
    pickSound.current.preload = 'auto';
    pickSound.current.volume = 0.35; // keep the chime gentle
  }, []);

  // 1-second clock for the countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const draftState = settings; // draft_state row holds status + settings
  const status = draftState?.status;
  const gpt = draftState?.golfers_per_team ?? 6;
  const hasTimer = (draftState?.pick_timer_seconds ?? 0) > 0; // 0 = no time limit

  // Players sitting out this tournament are skipped for the whole draft — the
  // snake order, the clock, the board, and "your turn" all run over this set.
  const activeParts = useMemo(() => activeParticipants(participants), [participants]);
  const sittingOut = useMemo(() => participants.filter((p) => p.sitting_out), [participants]);

  const myParticipant = useMemo(
    () => activeParts.find((p) => p.user_id === user?.id) || null,
    [activeParts, user]
  );

  const complete =
    draftState && isDraftComplete(draftState, activeParts, gpt);
  const onClock = useMemo(
    () =>
      draftState && !complete
        ? snakePicker(draftState.current_pick, activeParts)
        : null,
    [draftState, activeParts, complete]
  );

  const isMyTurn = onClock && myParticipant && onClock.id === myParticipant.id;

  // A gentle two-note chime, synthesized so it needs no audio file. Plays when it
  // becomes YOUR turn to pick (see the effect below). Fails silently if the
  // browser blocks audio until a gesture.
  const playTurnChime = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window['webkitAudioContext'];
      if (!Ctx) return;
      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new Ctx();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime;
      // G5 → C6: a soft, rising "ding-ding".
      [
        { f: 783.99, at: 0 },
        { f: 1046.5, at: 0.13 },
      ].forEach(({ f, at }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.linearRampToValueAtTime(0.11, t0 + at + 0.02); // gentle
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + 0.55);
      });
    } catch {
      /* no-op */
    }
  }, []);

  // Chime once when the turn passes TO you (a reminder you're on the clock).
  // Baselines on first load so it doesn't fire on mount / tab revisit / refresh.
  useEffect(() => {
    if (loading) return;
    const mine = !!isMyTurn && status === 'active' && !complete;
    if (prevTurnRef.current === null) {
      prevTurnRef.current = mine; // baseline — don't chime for an already-active turn
      return;
    }
    if (mine && !prevTurnRef.current) playTurnChime();
    prevTurnRef.current = mine;
  }, [loading, isMyTurn, status, complete, playTurnChime]);

  const remaining = useMemo(() => {
    if (status !== 'active' || !draftState?.pick_deadline) return null;
    return Math.round((new Date(draftState.pick_deadline).getTime() - now) / 1000);
  }, [status, draftState, now]);

  // When the clock hits zero, nudge the server to auto-pick (idempotent, throttled).
  // No-op when there's no timer.
  useEffect(() => {
    if (status !== 'active' || complete || !hasTimer) return;
    if (remaining !== null && remaining <= 0 && Date.now() - tickGuard.current > 4000) {
      tickGuard.current = Date.now();
      fetch('/api/draft/tick', { method: 'POST' }).then(() => refresh());
    }
  }, [remaining, status, complete, hasTimer, refresh]);

  // Keep the auto-pick alive while the page is open even with no interaction.
  // Only needed when a timer is set (otherwise there's nothing to auto-fire).
  useEffect(() => {
    if (status !== 'active' || !hasTimer) return;
    const t = setInterval(() => {
      fetch('/api/draft/tick', { method: 'POST' }).then((r) => {
        if (r.ok) r.json().then((d) => d?.advanced && refresh());
      });
    }, 5000);
    return () => clearInterval(t);
  }, [status, hasTimer, refresh]);

  // Detect a new pick (mine, someone else's, or an auto-pick) and fire the
  // reveal animation. Waits for the pool to load before setting the baseline, so
  // the last pick doesn't replay every time the page mounts / the tab is revisited.
  useEffect(() => {
    if (loading) return;
    const maxPick = picks.length ? picks.reduce((m, p) => Math.max(m, p.pick_number), -1) : -1;
    if (seenPickRef.current === null) {
      seenPickRef.current = maxPick; // baseline once loaded — don't animate the backlog
      return;
    }
    if (maxPick > seenPickRef.current) {
      const latest = picks.find((p) => p.pick_number === maxPick);
      const g = golfers.find((x) => x.id === latest?.golfer_id);
      const part = participants.find((x) => x.id === latest?.participant_id);
      if (g) {
        const mine = !!myParticipant && part?.id === myParticipant.id;
        setPickReveal({
          name: g.name,
          team: part?.display_name,
          seed: part?.draft_position,
          mine,
          athleteId: live?.[g.name.toLowerCase()]?.athleteId ?? null,
        });
        // Chime only when YOUR team's pick is made; the name + face reveal still
        // shows for every pick.
        if (mine) {
          const a = pickSound.current;
          if (a) {
            try {
              a.currentTime = 0;
              a.play().catch(() => {}); // ignore autoplay-policy blocks
            } catch {
              /* no-op */
            }
          }
        }
      }
    }
    // Always resync — also handles undo (maxPick drops) so a re-pick re-animates.
    seenPickRef.current = maxPick;
  }, [loading, picks, golfers, participants, live, myParticipant]);

  // Auto-dismiss the reveal.
  useEffect(() => {
    if (!pickReveal) return;
    const t = setTimeout(() => setPickReveal(null), 2800);
    return () => clearTimeout(t);
  }, [pickReveal]);

  const takenIds = useMemo(() => new Set(picks.map((p) => p.golfer_id)), [picks]);
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = golfers
      .filter((g) => !takenIds.has(g.id))
      .filter((g) => g.name.toLowerCase().includes(q));
    // Always "favorites": best world ranking first; unranked longshots last.
    return [...list].sort((a, b) => {
      const ra = a.rank ?? Infinity;
      const rb = b.rank ?? Infinity;
      return ra === rb ? a.name.localeCompare(b.name) : ra - rb;
    });
  }, [golfers, takenIds, search]);

  // How many of the remaining field are world-ranked — tells us whether the
  // "Favorites" ordering is meaningful or the event simply has no ranking data.
  const rankedCount = useMemo(
    () => available.filter((g) => g.rank != null).length,
    [available]
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

  // Open the scouting card for a golfer (athleteId comes from the live field).
  function openProfile(g) {
    setProfilePlayer({
      name: g.name,
      athleteId: live?.[g.name.toLowerCase()]?.athleteId ?? null,
      rank: g.rank,
      golferId: g.id,
    });
  }

  if (loading) return <Loading />;

  const total = totalPicks(activeParts, gpt);

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
        <>
          <div className="card bg-masters-green text-white text-center mb-5">
            <p className="font-serif text-lg">🏆 The draft is complete!</p>
            <p className="text-white/70 text-sm">Head to Standings to follow the action.</p>
          </div>
          <DraftReview picks={picks} golfers={golfers} participants={participants} />
        </>
      )}

      {status === 'active' && !complete && onClock && (
        <div
          className={`card mb-5 flex items-center justify-between ${
            isMyTurn ? 'bg-masters-gold-pale border-2 border-masters-gold animate-your-pick' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Pick {draftState.current_pick + 1} of {total} · Round{' '}
              {Math.floor(draftState.current_pick / Math.max(activeParts.length, 1)) + 1}
            </div>
            {isMyTurn ? (
              <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-masters-gold text-masters-green text-xs font-extrabold uppercase tracking-widest animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-masters-green" /> Your Pick
                </span>
                <span className="font-serif text-2xl font-bold text-masters-green leading-none">
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
            {hasTimer ? (
              <>
                <div
                  className={`font-serif text-3xl font-bold tabular-nums ${
                    remaining !== null && remaining <= 60 ? 'text-score-over' : 'text-masters-green'
                  }`}
                >
                  {fmtClock(remaining)}
                </div>
                <div className="text-[11px] text-gray-400">auto-picks best available</div>
              </>
            ) : (
              <div className="text-[11px] uppercase tracking-wide text-gray-400">
                No time limit
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-800 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
      )}

      {!complete && (
      <div className="flex flex-col gap-5">
        {/* ── Available golfers ───────────────────────────────────── */}
        <div className="card order-1">
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
            className="input mb-2"
            placeholder="Search golfers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="text-[11px] text-gray-400 mb-2">
            {rankedCount > 0
              ? 'Ordered by world ranking — the betting-favorite order.'
              : 'No world ranking for this field yet — refresh the field in Admin.'}
          </p>
          {/* ~6 golfers visible; scroll for the rest. */}
          <div className="max-h-[264px] overflow-y-auto -mx-1 px-1">
            {available.map((g) => {
              const canPick =
                status === 'active' && !complete && (isMyTurn || profile?.is_admin);
              const fav = g.rank != null && g.rank <= 10; // a clear betting favorite
              return (
                <div
                  key={g.id}
                  className="flex items-center justify-between py-2 border-b border-masters-green-light/60 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => openProfile(g)}
                    title="Tap for scouting report"
                    className="min-w-0 flex items-center gap-2 text-left flex-1 hover:opacity-70 transition-opacity"
                  >
                    <span
                      className={`text-xs tabular-nums w-8 shrink-0 text-right ${
                        fav ? 'text-masters-gold font-bold' : 'text-gray-400'
                      }`}
                    >
                      {g.rank != null ? `#${g.rank}` : '–'}
                    </span>
                    <span className="font-medium truncate">{g.name}</span>
                    {g.odds && <span className="text-xs text-gray-400 shrink-0">{g.odds}</span>}
                    <span className="text-gray-300 text-xs shrink-0">ⓘ</span>
                  </button>
                  {canPick && (
                    <button
                      disabled={picking}
                      onClick={() => draftGolfer(g.id)}
                      className={`btn-gold btn-sm ${isMyTurn ? 'animate-draft' : ''}`}
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
        <div className="card order-2">
          <div className="card-title">Draft Board</div>
          {sittingOut.length > 0 && (
            <p className="text-xs text-gray-400 mb-2">
              🪑 Sitting out: {sittingOut.map((p) => p.display_name).join(', ')}
            </p>
          )}
          <div className="-mx-1">
            {activeParts.length === 0 && (
              <p className="text-sm text-gray-400 px-1">No active players yet.</p>
            )}
            {activeParts.map((p) => {
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
                  className={`border-l-4 ${c.borderL} border-b border-masters-green-light/60 last:border-b-0 px-2 py-2 ${
                    isOnClock && isMe
                      ? 'bg-masters-gold-pale animate-turn'
                      : isOnClock
                        ? 'bg-masters-gold-pale ring-1 ring-inset ring-masters-gold'
                        : ''
                  }`}
                >
                  {/* Team header */}
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                    <span className="text-[11px] text-gray-400 shrink-0 tabular-nums w-3 text-right">
                      {p.draft_position}
                    </span>
                    <span className={`text-sm font-semibold ${c.text}`}>{p.display_name}</span>
                    {isMe && <span className="text-[9px] font-bold uppercase text-masters-gold shrink-0">you</span>}
                    {isOnClock && (
                      <span className="text-[9px] font-bold uppercase text-masters-green animate-pulse shrink-0">
                        picking
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-gray-400 shrink-0 tabular-nums">
                      {roster.length}/{gpt}
                    </span>
                  </div>
                  {/* Aligned grid of pick boxes — one slot per roster spot, so the
                      full roster shows and teams line up even in the last round. */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-1.5">
                    {Array.from({ length: gpt }).map((_, i) => {
                      const g = roster[i];
                      return g ? (
                        <span
                          key={i}
                          title={g.name}
                          className={`rounded-md px-2 py-1 text-xs font-medium truncate ${c.bg} ${c.text}`}
                        >
                          {g.name}
                        </span>
                      ) : (
                        <span
                          key={i}
                          className="rounded-md px-2 py-1 text-xs text-center text-gray-300 border border-dashed border-gray-200"
                        >
                          —
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {pickReveal && <PickReveal pick={pickReveal} onClose={() => setPickReveal(null)} />}

      {profilePlayer && (
        <PlayerProfileCard
          player={profilePlayer}
          busy={picking}
          canPick={status === 'active' && !complete && (isMyTurn || profile?.is_admin)}
          onDraft={() => {
            draftGolfer(profilePlayer.golferId);
            setProfilePlayer(null);
          }}
          onClose={() => setProfilePlayer(null)}
        />
      )}
    </div>
  );
}

// Celebratory pick reveal: the golfer's headshot pops out of a dot to full size
// with "You picked …" (or "<Team> picked …"). Tap anywhere to dismiss early.
function PickReveal({ pick, onClose }) {
  const [imgOk, setImgOk] = useState(true);
  const c = teamColor(pick.seed);
  const headshot = pick.athleteId
    ? `https://a.espncdn.com/i/headshots/golf/players/full/${pick.athleteId}.png`
    : null;
  const initials = (pick.name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 backdrop-blur-sm px-6"
    >
      <div className="animate-pick flex flex-col items-center text-center">
        <div
          className="w-32 h-32 rounded-full overflow-hidden flex items-center justify-center bg-masters-green-light shadow-2xl"
          style={{ boxShadow: `0 0 0 4px ${c.hex || '#1a4d2e'}, 0 10px 40px rgba(0,0,0,0.4)` }}
        >
          {headshot && imgOk ? (
            <img
              src={headshot}
              alt={pick.name}
              onError={() => setImgOk(false)}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-serif text-4xl font-bold text-masters-green">{initials}</span>
          )}
        </div>
        <div className="animate-pick-fade mt-5 text-white">
          <div className="text-xs uppercase tracking-[0.2em] text-white/70">
            {pick.mine ? 'You picked' : `${pick.team || 'Team'} picked`}
          </div>
          <div className="font-serif text-3xl font-bold mt-1.5 drop-shadow">{pick.name}</div>
        </div>
      </div>
    </div>
  );
}

// Post-draft recap: every pick in order, labelled round.pickInRound (e.g. "2.3"),
// grouped by round, with the golfer and the team that took them.
function DraftReview({ picks, golfers, participants }) {
  const teams = participants.length || 1;
  const gById = new Map(golfers.map((g) => [g.id, g]));
  const pById = new Map(participants.map((p) => [p.id, p]));
  const sorted = [...picks].sort((a, b) => a.pick_number - b.pick_number);

  const rounds = [];
  for (const pk of sorted) {
    const round = Math.floor(pk.pick_number / teams) + 1;
    let bucket = rounds.find((b) => b.round === round);
    if (!bucket) {
      bucket = { round, items: [] };
      rounds.push(bucket);
    }
    bucket.items.push(pk);
  }

  return (
    <div className="card">
      <div className="card-title">Draft Review</div>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400">No picks recorded.</p>
      ) : (
        <div className="space-y-4">
          {rounds.map(({ round, items }) => (
            <div key={round}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-masters-green/60 mb-1.5">
                Round {round}
              </div>
              <div className="space-y-0.5">
                {items.map((pk) => {
                  const pos = (pk.pick_number % teams) + 1;
                  const g = gById.get(pk.golfer_id);
                  const p = pById.get(pk.participant_id);
                  const c = teamColor(p?.draft_position);
                  return (
                    <div
                      key={pk.pick_number}
                      className="flex items-center gap-3 text-sm py-1.5 border-b border-masters-green-light/40 last:border-0"
                    >
                      <span className="w-10 shrink-0 font-mono text-xs font-bold tabular-nums text-masters-green">
                        {round}.{pos}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-medium text-gray-800">
                        {g?.name || '—'}
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 shrink-0 text-xs font-semibold"
                        style={{ color: c.hex || undefined }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: c.hex || '#9ca3af' }}
                        />
                        <span className="max-w-[120px] truncate">{p?.display_name}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
