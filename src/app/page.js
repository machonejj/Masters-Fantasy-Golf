'use client';

import { useMemo, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { teamData, scoreText, scoreColor, golferTotal } from '@/lib/scoring';

export default function LeaderboardPage() {
  const { loading, settings, participants, golfers, picks } = usePoolData();
  const [expanded, setExpanded] = useState(null);

  const standings = useMemo(() => {
    if (!settings) return [];
    return participants
      .map((p) => ({ p, ...teamData(p.id, picks, golfers, settings) }))
      .sort((a, b) => {
        if (a.teamScore === null) return 1;
        if (b.teamScore === null) return -1;
        return a.teamScore - b.teamScore;
      });
  }, [participants, picks, golfers, settings]);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        subtitle={`${settings?.tournament_name || 'The Masters'} · best ${
          settings?.counting_scores ?? 3
        } of ${settings?.golfers_per_team ?? 6} count`}
      />

      {standings.length === 0 ? (
        <div className="card text-center text-gray-500">
          No teams yet. The admin needs to add participants.
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          {standings.map((row, i) => {
            const isOpen = expanded === row.p.id;
            return (
              <div key={row.p.id} className="border-b border-masters-green-light last:border-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : row.p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-masters-green-pale text-left"
                >
                  <span
                    className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0
                        ? 'bg-masters-gold text-masters-green'
                        : 'bg-masters-green-light text-masters-green'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{row.p.display_name}</div>
                    <div className="text-xs text-gray-400">
                      {row.golfers.length} golfer{row.golfers.length === 1 ? '' : 's'} drafted
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
                        .map(({ g, score }) => (
                          <div
                            key={g.id}
                            className="flex items-center justify-between py-1.5 text-sm border-t border-masters-green-light/60 first:border-0"
                          >
                            <span className="flex items-center gap-2">
                              {row.countingSet.has(g.id) ? (
                                <span className="chip bg-masters-gold-light text-masters-green">
                                  counts
                                </span>
                              ) : (
                                <span className="chip bg-gray-100 text-gray-400">drop</span>
                              )}
                              <span className={g.status !== 'active' ? 'text-gray-400' : ''}>
                                {g.name}
                                {g.status === 'cut' && ' (CUT)'}
                                {g.status === 'wd' && ' (WD)'}
                              </span>
                            </span>
                            <span className={`font-semibold ${scoreColor(score)}`}>
                              {scoreText(score)}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
