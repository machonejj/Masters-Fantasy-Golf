'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loading, PageHeader } from '@/app/page';
import { scoreText, scoreColor } from '@/lib/scoring';
import { careerStats, formatMoney, formatPct, payoutLabel, ordinal } from '@/lib/gallery';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

// Stable key for a standings row — matches careerStats() so finishes line up.
const keyOf = (s) => s.participant_id ?? `name:${s.name}`;

async function api(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function GalleryPage() {
  const supabase = useRef(createClient()).current;
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(() => new Set()); // expanded ledger tournaments
  const [teamOpen, setTeamOpen] = useState(() => new Set()); // expanded record-book teams
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [tRes, pRes] = await Promise.all([
      supabase.from('tournaments').select('*').order('completed_at', { ascending: false }),
      supabase.from('participants').select('id, display_name'),
    ]);
    setTournaments(tRes.data || []);
    setParticipants(pRes.data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle();
        if (alive) setIsAdmin(!!prof?.is_admin);
      }
      await load();
    })();
    return () => {
      alive = false;
    };
  }, [supabase, load]);

  const nameById = useMemo(
    () => Object.fromEntries(participants.map((p) => [p.id, p.display_name])),
    [participants]
  );
  const stats = useMemo(() => careerStats(tournaments, nameById), [tournaments, nameById]);

  const makeToggle = (setFn) => (id) =>
    setFn((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleLedger = makeToggle(setOpen);
  const toggleTeam = makeToggle(setTeamOpen);

  async function run(fn) {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const setChampion = (t, row) => {
    if (!window.confirm(`Make ${row.name} the champion of ${t.name}? This re-ranks the field and re-awards the purse.`))
      return;
    run(() => api('/api/admin/tournaments', 'PATCH', { id: t.id, championKey: keyOf(row) }));
  };
  const deleteTournament = (t) => {
    if (!window.confirm(`Delete ${t.name} (${fmtDate(t.completed_at)}) from The Gallery? This cannot be undone.`))
      return;
    run(() => api(`/api/admin/tournaments?id=${t.id}`, 'DELETE'));
  };

  // Every finish a team has recorded, most recent first.
  const finishesFor = (key) =>
    tournaments
      .map((t) => {
        const r = (t.standings || []).find((s) => keyOf(s) === key);
        return r ? { t, r } : null;
      })
      .filter(Boolean);

  if (loading) return <Loading />;

  if (tournaments.length === 0) {
    return (
      <div>
        <PageHeader title="The Gallery" subtitle="A trophy room of past champions" />
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🏛️</div>
          <p className="font-serif text-lg text-masters-green">The Gallery awaits its first champion.</p>
          <p className="text-sm text-gray-500 mt-1">
            When a tournament is completed, an admin can close it to enshrine the result here —
            final standings, the champion, and the purse all preserved.
          </p>
        </div>
      </div>
    );
  }

  const earningsLeader = stats[0];
  const jacketsLeader = [...stats].sort((a, b) => b.wins - a.wins || b.earnings - a.earnings)[0];
  const cutLeader = [...stats]
    .filter((s) => s.draftedTotal > 0)
    .sort((a, b) => (b.madeCutRate ?? 0) - (a.madeCutRate ?? 0))[0];
  const totalPurse = tournaments.reduce((a, t) => a + (Number(t.purse) || 0), 0);

  return (
    <div>
      <PageHeader title="The Gallery" subtitle="A trophy room of past champions" />

      {err && <div className="bg-red-100 text-red-800 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}

      {/* ── Top stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard label="Career Earnings Leader" value={formatMoney(earningsLeader?.earnings || 0)} sub={earningsLeader?.name} gold />
        <StatCard label="Most Green Jackets" value={`${jacketsLeader?.wins || 0} 🏆`} sub={jacketsLeader?.wins ? jacketsLeader.name : 'None yet'} />
        <StatCard label="Best Made Cut Rate" value={formatPct(cutLeader?.madeCutRate)} sub={cutLeader?.name || '—'} />
        <StatCard label="Total Purse Awarded" value={formatMoney(totalPurse)} sub={`${tournaments.length} tournament${tournaments.length === 1 ? '' : 's'}`} />
      </div>

      {/* ── The Record Book — tap a team for their finishes ────── */}
      <div className="card mb-5">
        <div className="card-title">The Record Book</div>
        <div className="space-y-1.5">
          {stats.map((s) => {
            const isOpen = teamOpen.has(s.key);
            return (
              <div key={s.key} className="rounded-lg border border-masters-green-light overflow-hidden">
                <button
                  onClick={() => toggleTeam(s.key)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-masters-green-pale"
                >
                  <span className="flex-1 min-w-0 truncate font-medium text-gray-800">{s.name}</span>
                  <span className="text-xs text-gray-500 shrink-0 flex items-center gap-2">
                    {s.wins > 0 && <span title="Green Jackets">{s.wins}🏆</span>}
                    <span className="font-semibold text-masters-green">{formatMoney(s.earnings)}</span>
                  </span>
                  <span className="text-gray-300 text-xs shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 bg-white">
                    <div className="grid grid-cols-3 gap-y-2 gap-x-2 text-center my-2">
                      <Mini label="Played" value={s.entered} />
                      <Mini label="Green Jackets" value={s.wins} />
                      <Mini label="Top 3" value={s.top3} />
                      <Mini label="Avg Finish" value={s.avgFinish ? s.avgFinish.toFixed(1) : '—'} />
                      <Mini label="Best" value={s.bestFinish ? ordinal(s.bestFinish) : '—'} />
                      <Mini label="Made Cut" value={`${formatPct(s.madeCutRate)}`} sub={`${s.madeCutCount}/${s.draftedTotal}`} />
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-3 mb-1">
                      Finishes
                    </div>
                    <div className="space-y-0.5">
                      {finishesFor(s.key).map(({ t, r }) => {
                        const made = (r.golfers || []).filter((g) => g.made_cut).length;
                        return (
                          <div key={t.id} className="flex items-center gap-2 text-sm py-1 border-t border-masters-green-light/50 first:border-0">
                            <span className={`w-9 shrink-0 font-semibold ${r.position === 1 ? 'text-masters-gold' : 'text-gray-500'}`}>
                              {r.position === 1 ? '🏆' : ordinal(r.position)}
                            </span>
                            <span className="flex-1 min-w-0 truncate text-gray-700">{t.name}</span>
                            <span className={`w-12 text-right tabular-nums ${scoreColor(r.score)}`}>{scoreText(r.score)}</span>
                            <span className="w-14 text-right tabular-nums text-gray-400 text-xs">{made}/{(r.golfers || []).length} cut</span>
                            <span className="w-14 text-right tabular-nums text-masters-green text-xs">{r.winnings ? formatMoney(r.winnings) : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Tap a team for their full record. Made Cut = drafted golfers who made the cut, across all tournaments.
        </p>
      </div>

      {/* ── Past Champions ─────────────────────────────────────── */}
      <div className="card mb-5">
        <div className="card-title">Past Champions</div>
        <div className="space-y-2">
          {tournaments.map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <span className="text-lg">🏆</span>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-masters-green leading-tight truncate">{t.champion_name || '—'}</div>
                <div className="text-xs text-gray-400 truncate">{t.name} · {fmtDate(t.completed_at)}</div>
              </div>
              <span className="text-sm font-semibold text-masters-gold shrink-0">{formatMoney(championWinnings(t))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tournament Ledger ──────────────────────────────────── */}
      <div className="card">
        <div className="card-title">Tournament Ledger</div>
        <div className="space-y-2">
          {tournaments.map((t) => {
            const isOpen = open.has(t.id);
            const rows = [...(t.standings || [])].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
            return (
              <div key={t.id} className="rounded-lg border border-masters-green-light overflow-hidden">
                <div className="flex items-stretch">
                  <button
                    onClick={() => toggleLedger(t.id)}
                    className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left hover:bg-masters-green-pale"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 truncate">{t.name}</div>
                      <div className="text-xs text-gray-400">
                        {fmtDate(t.completed_at)} · {payoutLabel(t.payout_structure)} · purse {formatMoney(t.purse)}
                      </div>
                    </div>
                    <span className="text-xs text-masters-green-mid shrink-0">{isOpen ? 'Hide' : 'Final Leaderboard'}</span>
                  </button>
                  {isAdmin && (
                    <button
                      disabled={busy}
                      onClick={() => deleteTournament(t)}
                      className="shrink-0 px-3 text-gray-300 hover:text-red-600 hover:bg-red-50"
                      title="Delete this tournament from The Gallery"
                      aria-label="Delete tournament"
                    >
                      🗑
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 bg-white">
                    {rows.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">No standings recorded.</p>
                    ) : (
                      rows.map((r) => (
                        <div
                          key={`${t.id}-${keyOf(r)}`}
                          className={`flex items-center gap-2 py-1.5 text-sm border-t border-masters-green-light/50 first:border-0 ${
                            r.position === 1 ? 'font-semibold' : ''
                          }`}
                        >
                          <span className={`w-6 text-center ${r.position === 1 ? 'text-masters-gold' : 'text-gray-400'}`}>
                            {r.position === 1 ? '🏆' : r.position}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-gray-800">{r.name}</span>
                          {isAdmin && r.position !== 1 && (
                            <button
                              disabled={busy}
                              onClick={() => setChampion(t, r)}
                              className="text-[11px] text-masters-green-mid underline shrink-0"
                              title="Make this team the champion"
                            >
                              Make champion
                            </button>
                          )}
                          <span className={`w-12 text-right tabular-nums ${scoreColor(r.score)}`}>{scoreText(r.score)}</span>
                          <span className="w-16 text-right tabular-nums text-masters-green">{r.winnings ? formatMoney(r.winnings) : ''}</span>
                        </div>
                      ))
                    )}
                    {t.notes && <p className="text-xs text-gray-400 mt-2 italic">“{t.notes}”</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {isAdmin && (
          <p className="text-[11px] text-gray-400 mt-2">
            Admin: tap 🗑 to remove a tournament, or open one to set its champion.
          </p>
        )}
      </div>
    </div>
  );
}

// The champion's payout for a tournament (position 1's winnings).
function championWinnings(t) {
  const champ = (t.standings || []).find((s) => s.position === 1);
  return champ?.winnings || 0;
}

function StatCard({ label, value, sub, gold }) {
  return (
    <div className={`card !p-3.5 ${gold ? 'bg-masters-green text-white' : ''}`}>
      <div className={`text-[10px] uppercase tracking-wider ${gold ? 'text-white/60' : 'text-gray-400'}`}>{label}</div>
      <div className={`font-serif text-2xl leading-tight mt-1 ${gold ? 'text-masters-gold' : 'text-masters-green'}`}>{value}</div>
      <div className={`text-xs truncate mt-0.5 ${gold ? 'text-white/80' : 'text-gray-500'}`}>{sub || '—'}</div>
    </div>
  );
}

function Mini({ label, value, sub }) {
  return (
    <div>
      <div className="font-serif text-lg text-masters-green leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}
