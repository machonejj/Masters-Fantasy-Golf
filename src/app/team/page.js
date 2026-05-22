'use client';

import { useMemo, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { Loading, PageHeader } from '@/app/page';
import { teamData, scoreText, scoreColor } from '@/lib/scoring';
import { useLiveScores, mergeLive } from '@/lib/useLiveScores';
import PlayerScorecard from '@/components/PlayerScorecard';

export default function MyTeamPage() {
  const { loading, user, settings, participants, golfers, picks } = usePoolData();
  const [selected, setSelected] = useState(null); // golfer to show scorecard for

  // Live ESPN scores so the roster + standing stay current automatically.
  const { live } = useLiveScores();
  const liveGolfers = useMemo(() => golfers.map((g) => mergeLive(g, live)), [golfers, live]);

  const me = useMemo(
    () => participants.find((p) => p.user_id === user?.id) || null,
    [participants, user]
  );

  const data = useMemo(
    () => (me && settings ? teamData(me.id, picks, liveGolfers, settings) : null),
    [me, settings, picks, liveGolfers]
  );

  const rank = useMemo(() => {
    if (!settings) return null;
    const standings = participants
      .map((p) => teamData(p.id, picks, liveGolfers, settings))
      .map((d, i) => ({ id: participants[i].id, score: d.teamScore }))
      .filter((x) => x.score !== null)
      .sort((a, b) => a.score - b.score);
    const idx = standings.findIndex((x) => x.id === me?.id);
    return idx === -1 ? null : idx + 1;
  }, [participants, picks, liveGolfers, settings, me]);

  if (loading) return <Loading />;

  if (!me) {
    return (
      <div>
        <PageHeader title="My Team" />
        <div className="card text-center text-gray-600">
          You’re not in the draft yet. Ask the pool admin to add you as a participant.
        </div>
      </div>
    );
  }

  const counting = settings.counting_scores;
  const ranked = [...data.withScores].sort((a, b) => (a.score ?? 999) - (b.score ?? 999));

  return (
    <div>
      <PageHeader title="My Team" subtitle={me.display_name} />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Team Score" value={scoreText(data.teamScore)} accent={scoreColor(data.teamScore)} />
        <Stat label="Standing" value={rank ? `#${rank}` : '—'} />
        <Stat label="Golfers" value={`${data.golfers.length}/${settings.golfers_per_team}`} />
      </div>

      <div className="card">
        <div className="card-title">
          Roster · best {counting} of {settings.golfers_per_team} count
        </div>
        {ranked.length === 0 ? (
          <p className="text-sm text-gray-400">No golfers drafted yet.</p>
        ) : (
          ranked.map(({ g, score }) => (
            <div
              key={g.id}
              onClick={() =>
                setSelected({ name: g.name, owner: me.display_name, teamSeed: me.draft_position })
              }
              className="flex items-center justify-between py-2.5 border-b border-masters-green-light/60 last:border-0 cursor-pointer hover:bg-masters-green-pale/60 rounded -mx-1 px-1"
            >
              <div className="flex items-center gap-2">
                {data.countingSet.has(g.id) ? (
                  <span className="chip bg-masters-gold-light text-masters-green">counts</span>
                ) : (
                  <span className="chip bg-gray-100 text-gray-400">drop</span>
                )}
                <span>
                  <span className="text-xs text-gray-400 mr-1.5">#{g.rank ?? '–'}</span>
                  {g.name}
                  {g.status === 'cut' && <span className="text-score-over text-xs ml-1">CUT</span>}
                  {g.status === 'wd' && <span className="text-score-over text-xs ml-1">WD</span>}
                </span>
              </div>
              <span className={`font-serif font-bold ${scoreColor(score)}`}>
                {scoreText(score)}
              </span>
            </div>
          ))
        )}
      </div>

      {selected && (
        <PlayerScorecard player={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, accent = 'text-masters-green' }) {
  return (
    <div className="card text-center !p-4">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`font-serif text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}
