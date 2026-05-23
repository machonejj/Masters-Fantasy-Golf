'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Loading, PageHeader } from '@/app/page';
import { scoreText, scoreColor } from '@/lib/scoring';
import { teamColor } from '@/lib/teamColors';
import ProbChart from '@/components/ProbChart';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'mine', label: 'My Team' },
  { key: 'pars', label: 'Pars' },
];

// A hole's to-par → how loud it should be. Par is intentionally plain; under-par
// is "good" (green), over-par is "bad" (rose). `major` marks the big swings.
function classify(toPar) {
  if (toPar <= -3) return { verb: 'went low on', icon: '🦅', tone: 'good', major: true };
  if (toPar === -2) return { verb: 'eagled', icon: '🦅', tone: 'good', major: true };
  if (toPar === -1) return { verb: 'birdied', icon: '🐦', tone: 'good' };
  if (toPar === 0) return { verb: 'parred', icon: '', tone: 'flat' };
  if (toPar === 1) return { verb: 'bogeyed', icon: '🔻', tone: 'bad' };
  if (toPar === 2) return { verb: 'double bogeyed', icon: '💥', tone: 'bad', major: true };
  return { verb: 'blew up on', icon: '⚠️', tone: 'bad', major: true };
}

// The single biggest "moment" an event represents (banner-worthy), or null.
// Kept rare on purpose: only eagles, big numbers, and team lead/top-3 swings.
// Back-to-back birdies are common, so they get a small inline badge instead.
function highlightOf(e) {
  if (e.tookLead) return { icon: '🔥', tone: 'good', text: `${e.team} takes the lead` };
  if (e.top3In) return { icon: '🔥', tone: 'good', text: `${e.team} moves into the top 3` };
  if (e.lostLead) return { icon: '🚨', tone: 'bad', text: `${e.team} loses the lead` };
  if (e.top3Out) return { icon: '🚨', tone: 'bad', text: `${e.team} drops out of the top 3` };
  if (e.toPar <= -2) return { icon: '🦅', tone: 'good', text: e.toPar <= -3 ? 'Albatross!' : 'Eagle!' };
  if (e.toPar >= 2) return { icon: '💥', tone: 'bad', text: e.toPar >= 3 ? 'Big number' : 'Double bogey' };
  return null;
}

const evKey = (e) => `${e.teamId}-${e.golfer}-${e.round}-${e.hole}`;
const moved = (e) =>
  e.teamBefore !== null && e.teamBefore !== undefined && e.teamAfter !== null && e.teamBefore !== e.teamAfter;

export default function LiveFeedPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [filter, setFilter] = useState('all');
  const [newKeys, setNewKeys] = useState(() => new Set());
  const seenRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/feed')
        .then((r) => r.json())
        .then((d) => {
          if (alive) {
            setData(d);
            setStatus('ok');
          }
        })
        .catch(() => alive && setStatus('error'));
    load();
    const t = setInterval(load, 90000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Flag freshly-arrived events so they animate in — but never on the first
  // load (otherwise the whole list would slide in at once).
  useEffect(() => {
    if (!data?.events) return;
    const keys = data.events.map(evKey);
    if (seenRef.current) {
      setNewKeys(new Set(keys.filter((k) => !seenRef.current.has(k))));
    }
    seenRef.current = new Set(keys);
  }, [data]);

  if (status === 'loading' && !data) return <Loading />;

  const events = data?.events || [];
  const teams = data?.teams || [];
  const myId = data?.myTeamId || null;
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));

  const counts = {
    all: events.length,
    scoring: events.filter((e) => e.toPar !== 0).length,
    mine: events.filter((e) => e.teamId === myId).length,
    pars: events.filter((e) => e.toPar === 0).length,
  };
  const shown = events.filter((e) => {
    if (filter === 'scoring') return e.toPar !== 0;
    if (filter === 'pars') return e.toPar === 0;
    if (filter === 'mine') return e.teamId === myId;
    return true;
  });

  return (
    <div>
      <PageHeader title="Live Feed" subtitle="Drafted players · hole by hole" />

      {teams.length > 0 && (
        <div className="card mb-4">
          <ProbChart teams={teams} baseline={data.baseline} highlightId={myId} compact />
        </div>
      )}

      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`btn-sm rounded-full whitespace-nowrap ${
              filter === f.key ? 'btn-primary' : 'btn-outline'
            } ${f.key === 'mine' && !myId ? 'hidden' : ''}`}
          >
            {f.label}
            <span className={filter === f.key ? 'opacity-80' : 'opacity-50'}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card text-center text-sm text-gray-400 py-8">
          {events.length === 0
            ? 'No scoring yet — check back once play is underway.'
            : 'Nothing here for this filter.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {shown.map((e, i) => {
            const prev = shown[i - 1];
            const showRound = !prev || prev.round !== e.round;
            const isNew = newKeys.has(evKey(e));
            const team = teamById[e.teamId];
            const mine = e.teamId === myId;
            const hl = e.toPar !== 0 ? highlightOf(e) : null;
            return (
              <Fragment key={evKey(e)}>
                {showRound && <RoundDivider round={e.round} />}
                {e.toPar === 0 ? (
                  <ParRow e={e} team={team} />
                ) : hl ? (
                  <HighlightRow e={e} hl={hl} team={team} mine={mine} isNew={isNew} />
                ) : (
                  <ScoreRow e={e} team={team} mine={mine} isNew={isNew} />
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoundDivider({ round }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-0.5 first:pt-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-masters-green/60">
        Round {round}
      </span>
      <span className="flex-1 h-px bg-masters-green-light" />
    </div>
  );
}

// Owner tag for the right edge: colored dot + team + current total.
function TeamTag({ team, total, hex, light = false }) {
  return (
    <div className="flex flex-col items-end shrink-0 leading-tight">
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: light ? '#9ca3af' : hex || '#6b7280' }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: light ? '#d1d5db' : hex || '#9ca3af' }}
        />
        <span className="max-w-[84px] truncate">{team}</span>
      </span>
      {total !== null && total !== undefined && (
        <span className={`text-sm font-bold tabular-nums ${scoreColor(total)}`}>
          {scoreText(total)}
        </span>
      )}
    </div>
  );
}

// Quiet, single-line par row — background information.
function ParRow({ e, team }) {
  const c = teamColor(team?.seed);
  return (
    <div className="flex items-center gap-2 px-2.5 py-0.5 text-[11px] text-gray-400">
      <span className="truncate">
        {e.golfer} · Par · Hole {e.hole}
      </span>
      <span className="ml-auto flex items-center gap-1 shrink-0">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: c.hex ? `${c.hex}59` : '#d1d5db' }}
        />
        <span className="max-w-[70px] truncate">{e.team}</span>
      </span>
    </div>
  );
}

// Card-style row for an ordinary score change (birdie / bogey).
function ScoreRow({ e, team, mine, isNew }) {
  const cls = classify(e.toPar);
  const c = teamColor(team?.seed);
  const good = cls.tone === 'good';
  const didMove = moved(e);
  const improved = didMove && e.teamAfter < e.teamBefore;

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${isNew ? 'feed-new' : ''} ${
        good ? 'border-emerald-100 bg-emerald-50/50' : 'border-rose-100 bg-rose-50/50'
      } ${mine ? 'ring-1 ring-masters-gold/50' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none mt-px shrink-0">{cls.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug">
            <span className="font-bold text-gray-900">{e.golfer}</span>{' '}
            <span className="text-gray-500">
              {cls.verb} Hole {e.hole}
            </span>
            {e.backToBack && e.toPar < 0 && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-orange-100 px-1.5 py-px text-[10px] font-bold text-orange-600 align-middle">
                🔥 hot
              </span>
            )}
          </div>
          {didMove ? (
            <div
              className={`text-[13px] font-bold mt-0.5 tabular-nums ${
                improved ? 'text-emerald-600' : 'text-rose-500'
              }`}
            >
              {e.team} {improved ? 'improved' : 'dropped'} {scoreText(e.teamBefore)} →{' '}
              {scoreText(e.teamAfter)}
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 mt-0.5">
              now {scoreText(e.total)} · no change to team score
            </div>
          )}
        </div>
        <TeamTag team={e.team} total={team?.total} hex={c.hex} />
      </div>
    </div>
  );
}

// Big gradient banner for highlight moments (eagles, lead changes, meltdowns…).
function HighlightRow({ e, hl, team, mine, isNew }) {
  const cls = classify(e.toPar);
  const good = hl.tone === 'good';
  const didMove = moved(e);
  return (
    <div
      className={`relative overflow-hidden rounded-xl px-3.5 py-3 text-white shadow-masters ${
        isNew ? 'feed-new' : ''
      } ${
        good
          ? 'bg-gradient-to-r from-masters-green to-emerald-600'
          : 'bg-gradient-to-r from-rose-600 to-orange-500'
      } ${mine ? 'ring-2 ring-masters-gold' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none shrink-0">{hl.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[15px] leading-tight">{hl.text}</div>
          <div className="text-xs text-white/85 mt-0.5 truncate">
            <span className="font-semibold">{e.golfer}</span> {cls.verb} Hole {e.hole}
            {didMove && (
              <>
                {' '}
                · {e.team} {scoreText(e.teamBefore)} → {scoreText(e.teamAfter)}
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 leading-tight">
          {team?.total !== null && team?.total !== undefined && (
            <div className="font-serif text-xl font-bold tabular-nums">{scoreText(team.total)}</div>
          )}
          <div className="text-[10px] uppercase tracking-wide text-white/75 max-w-[84px] truncate">
            {e.team}
          </div>
        </div>
      </div>
    </div>
  );
}
