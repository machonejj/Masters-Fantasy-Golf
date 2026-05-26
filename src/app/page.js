'use client';

import { useMemo, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { teamData, scoreText, scoreColor, liveRoundIndex } from '@/lib/scoring';
import { activeParticipants } from '@/lib/draft';
import { teamColor } from '@/lib/teamColors';
import { useLiveScores, mergeLive } from '@/lib/useLiveScores';
import PlayerScorecard from '@/components/PlayerScorecard';
import LiveStatus from '@/components/LiveStatus';
import SittingOutNotice from '@/components/SittingOutNotice';

export default function LeaderboardPage() {
  const { loading, user, settings, participants, golfers, picks } = usePoolData();
  // Set of expanded participant ids — multiple teams can be open at once, and
  // toggling one never collapses the others.
  const [expanded, setExpanded] = useState(() => new Set());
  const [selected, setSelected] = useState(null); // golfer to show scorecard for

  const toggleExpanded = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Live ESPN scores, refreshed on an interval, so standings stay current.
  const { live, updatedAt, status: liveStatus, refresh: refreshLive } = useLiveScores();
  const liveGolfers = useMemo(() => golfers.map((g) => mergeLive(g, live)), [golfers, live]);

  // Players sitting out this tournament have no team — keep them out of the
  // standings, but list their names below so it's clear they're still in the pool.
  const sittingOut = useMemo(() => participants.filter((p) => p.sitting_out), [participants]);

  const standings = useMemo(() => {
    if (!settings) return [];
    return activeParticipants(participants)
      .map((p) => ({ p, ...teamData(p.id, picks, liveGolfers, settings) }))
      .sort((a, b) => {
        if (a.teamScore === null) return 1;
        if (b.teamScore === null) return -1;
        return a.teamScore - b.teamScore;
      });
  }, [participants, picks, liveGolfers, settings]);

  const myId = participants.find((p) => p.user_id === user?.id)?.id ?? null;

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Standings"
        subtitle={`${settings?.tournament_name || 'The Masters'} · best ${
          settings?.counting_scores ?? 3
        } of ${settings?.golfers_per_team ?? 6} count`}
        action={
          <LiveStatus status={liveStatus} updatedAt={updatedAt} onRefresh={refreshLive} />
        }
      />

      <SittingOutNotice
        participants={participants}
        userId={user?.id}
        tournament={settings?.tournament_name}
      />

      {standings.length === 0 ? (
        <div className="card text-center text-gray-500">
          No teams yet. The admin needs to add participants.
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          {standings.map((row, i) => {
            const isOpen = expanded.has(row.p.id);
            const color = teamColor(row.p.draft_position);
            const isMe = row.p.id === myId;
            return (
              <div
                key={row.p.id}
                className={`border-b border-masters-green-light last:border-0 border-l-4 ${color.borderL} ${
                  isMe ? 'bg-masters-gold-pale' : ''
                }`}
              >
                <button
                  onClick={() => toggleExpanded(row.p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-masters-green-pale text-left"
                >
                  <span
                    className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-masters-gold text-masters-green' : `${color.bg} ${color.text}`
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
                      <span className={`font-semibold truncate ${color.text}`}>
                        {row.p.display_name}
                      </span>
                      {isMe && (
                        <span className="chip bg-masters-gold text-masters-green shrink-0">You</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {row.golfers.length} golfer{row.golfers.length === 1 ? '' : 's'} · best{' '}
                      {settings?.counting_scores ?? 3} count
                    </div>
                  </div>
                  <span className={`font-serif text-xl font-bold ${scoreColor(row.teamScore)}`}>
                    {scoreText(row.teamScore)}
                  </span>
                  <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 bg-masters-green-pale/50">
                    {row.golfers.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">No golfers drafted yet.</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                          <span className="flex-1" />
                          <span className="w-11 text-center">Thru</span>
                          <div className="flex gap-1">
                            {['R1', 'R2', 'R3', 'R4'].map((r) => (
                              <span key={r} className="w-6 text-center">
                                {r}
                              </span>
                            ))}
                          </div>
                          <span className="w-9 text-right">Tot</span>
                        </div>
                        {[...row.withScores]
                          .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
                          .map(({ g, score }) => {
                            const counts = row.countingSet.has(g.id);
                            const missedCut = g.status === 'cut';
                            return (
                              <div
                                key={g.id}
                                onClick={() =>
                                  setSelected({
                                    name: g.name,
                                    owner: row.p.display_name,
                                    teamSeed: row.p.draft_position,
                                    athleteId: g.athleteId ?? null,
                                  })
                                }
                                className={`flex items-center gap-2 py-1.5 text-sm border-t border-masters-green-light/60 first:border-0 cursor-pointer rounded -mx-1 px-1 ${
                                  missedCut ? 'bg-red-50 hover:bg-red-100/70' : 'hover:bg-white/60'
                                } ${counts ? 'ring-1 ring-inset ring-masters-green-mid/50' : ''}`}
                                title={counts ? 'Counts toward the team score' : undefined}
                              >
                                <span
                                  className={`flex-1 min-w-0 truncate ${
                                    g.status !== 'active' ? 'text-gray-400 line-through' : ''
                                  }`}
                                >
                                  {g.name}
                                  {g.status === 'cut' && ' (MC)'}
                                  {g.status === 'wd' && ' (WD)'}
                                </span>
                                <ThruCell g={g} />
                                <RoundBoxes g={g} />
                                <span className={`w-9 text-right font-semibold ${scoreColor(score)}`}>
                                  {scoreText(score)}
                                </span>
                              </div>
                            );
                          })}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sittingOut.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 px-1">
          🪑 Sitting out this tournament: {sittingOut.map((p) => p.display_name).join(', ')}
        </p>
      )}

      {selected && (
        <PlayerScorecard player={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

export function Loading() {
  return <div className="text-center text-gray-400 py-16">Loading…</div>;
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        <h1 className="font-serif text-2xl text-masters-green">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// The hole a golfer is currently through — like The Field's Thru column: a hole
// number while mid-round (amber), "F" once the round is done, or their tee time
// before they've started. Cut/withdrawn golfers show nothing.
function ThruCell({ g }) {
  if (g.status === 'cut' || g.status === 'wd') {
    return <span className="w-11 shrink-0 text-center text-[10px] text-gray-300">–</span>;
  }
  const thru = g.thru;
  const numeric = /^\d+$/.test(String(thru));
  return (
    <span
      className={`w-11 shrink-0 text-center tabular-nums ${
        numeric
          ? 'text-[11px] font-bold text-amber-600'
          : thru === 'F'
            ? 'text-[11px] font-semibold text-gray-400'
            : 'text-[9px] leading-tight text-gray-400'
      }`}
      title={
        numeric
          ? `Thru ${thru} holes`
          : thru === 'F'
            ? 'Round complete'
            : thru
              ? `Tee time ${thru}`
              : ''
      }
    >
      {thru || '–'}
    </span>
  );
}

// Per-round to-par as small score boxes (R1–R4). For a missed-cut golfer, the
// rounds they never played show "MC" in red. The round currently being played
// gets a gold tint + ring (its score is still live); finished rounds are plain.
function RoundBoxes({ g }) {
  const missedCut = g.status === 'cut';
  const liveIdx = liveRoundIndex([g.r1, g.r2, g.r3, g.r4], g.thru, g.status);
  return (
    <div className="flex gap-1 shrink-0">
      {[g.r1, g.r2, g.r3, g.r4].map((v, i) => {
        const has = v !== null && v !== undefined && v !== '';
        if (!has && missedCut) {
          return (
            <span
              key={i}
              title={`R${i + 1} · Missed cut`}
              className="w-6 text-center text-[10px] rounded py-0.5 bg-red-100 text-score-over font-semibold"
            >
              MC
            </span>
          );
        }
        const isLive = i === liveIdx;
        return (
          <span
            key={i}
            title={
              isLive
                ? `R${i + 1} · live (thru ${g.thru})`
                : `R${i + 1}${has ? ' · final' : ''}`
            }
            className={`w-6 text-center text-[10px] rounded py-0.5 ${
              isLive
                ? `bg-masters-gold-light ring-1 ring-masters-gold font-semibold ${scoreColor(Number(v))}`
                : has
                ? `bg-white ${scoreColor(Number(v))}`
                : 'bg-gray-50 text-gray-300'
            }`}
          >
            {has ? scoreText(Number(v)) : '–'}
          </span>
        );
      })}
    </div>
  );
}
