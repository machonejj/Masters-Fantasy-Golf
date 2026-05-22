'use client';

import { useMemo, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { teamData, scoreText, scoreColor, golferTotal } from '@/lib/scoring';
import { teamColor } from '@/lib/teamColors';
import { useLiveScores, mergeLive } from '@/lib/useLiveScores';
import PlayerScorecard from '@/components/PlayerScorecard';

export default function LeaderboardPage() {
  const { loading, settings, participants, golfers, picks } = usePoolData();
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(null); // golfer to show scorecard for

  // Live ESPN scores, refreshed on an interval, so standings stay current.
  const { live, updatedAt } = useLiveScores();
  const liveGolfers = useMemo(() => golfers.map((g) => mergeLive(g, live)), [golfers, live]);

  const standings = useMemo(() => {
    if (!settings) return [];
    return participants
      .map((p) => ({ p, ...teamData(p.id, picks, liveGolfers, settings) }))
      .sort((a, b) => {
        if (a.teamScore === null) return 1;
        if (b.teamScore === null) return -1;
        return a.teamScore - b.teamScore;
      });
  }, [participants, picks, liveGolfers, settings]);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Standings"
        subtitle={`${settings?.tournament_name || 'The Masters'} · best ${
          settings?.counting_scores ?? 3
        } of ${settings?.golfers_per_team ?? 6} count`}
        action={
          live ? (
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-masters-green">
                <span className="w-1.5 h-1.5 rounded-full bg-score-under animate-pulse" />
                Live
              </span>
              {updatedAt && (
                <div className="text-[10px] text-gray-400">
                  ESPN · {new Date(updatedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          ) : null
        }
      />

      {standings.length === 0 ? (
        <div className="card text-center text-gray-500">
          No teams yet. The admin needs to add participants.
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          {standings.map((row, i) => {
            const isOpen = expanded === row.p.id;
            const color = teamColor(row.p.draft_position);
            return (
              <div
                key={row.p.id}
                className={`border-b border-masters-green-light last:border-0 border-l-4 ${color.borderL}`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : row.p.id)}
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
                      [...row.withScores]
                        .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
                        .map(({ g, score }) => {
                          const counts = row.countingSet.has(g.id);
                          return (
                            <div
                              key={g.id}
                              onClick={() =>
                                setSelected({
                                  name: g.name,
                                  owner: row.p.display_name,
                                  teamSeed: row.p.draft_position,
                                })
                              }
                              className="flex items-center gap-2 py-1.5 text-sm border-t border-masters-green-light/60 first:border-0 cursor-pointer hover:bg-white/60 rounded -mx-1 px-1"
                            >
                              <span
                                className={`chip shrink-0 ${
                                  counts
                                    ? 'bg-masters-gold-light text-masters-green'
                                    : 'bg-gray-100 text-gray-400'
                                }`}
                              >
                                {counts ? 'counts' : 'drop'}
                              </span>
                              <span
                                className={`flex-1 min-w-0 truncate ${
                                  g.status !== 'active' ? 'text-gray-400 line-through' : ''
                                }`}
                              >
                                {g.name}
                                {g.status === 'cut' && ' (CUT)'}
                                {g.status === 'wd' && ' (WD)'}
                              </span>
                              <RoundBoxes g={g} />
                              <span className={`w-9 text-right font-semibold ${scoreColor(score)}`}>
                                {scoreText(score)}
                              </span>
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

// Per-round to-par as small score boxes (R1–R4). Hidden on the narrowest
// screens so the golfer row stays readable.
function RoundBoxes({ g }) {
  return (
    <div className="hidden sm:flex gap-1 shrink-0">
      {[g.r1, g.r2, g.r3, g.r4].map((v, i) => {
        const has = v !== null && v !== undefined && v !== '';
        return (
          <span
            key={i}
            title={`R${i + 1}`}
            className={`w-7 text-center text-[10px] rounded py-0.5 ${
              has ? `bg-white ${scoreColor(Number(v))}` : 'bg-gray-50 text-gray-300'
            }`}
          >
            {has ? scoreText(Number(v)) : '–'}
          </span>
        );
      })}
    </div>
  );
}
