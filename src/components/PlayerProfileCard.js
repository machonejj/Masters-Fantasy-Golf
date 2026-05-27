'use client';

import { useEffect, useState } from 'react';

// Tap-to-preview card in the Draft Room: a golfer's headshot, world ranking,
// season summary, and last 5 finishes — so you can scout before drafting.
// `player` = { name, athleteId, rank }. Optional Draft button when it's pickable.
export default function PlayerProfileCard({ player, canPick, onDraft, busy, onClose }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | error | none
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    if (!player?.athleteId) {
      setStatus('none');
      return;
    }
    let alive = true;
    setStatus('loading');
    setData(null);
    setImgOk(true);
    fetch(`/api/golfers/profile?id=${player.athleteId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && (setData(d), setStatus('ok')))
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [player?.athleteId]);

  const headshot = player?.athleteId
    ? `https://a.espncdn.com/i/headshots/golf/players/full/${player.athleteId}.png`
    : null;
  const initials = (player?.name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm sm:px-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[88vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="bg-masters-green text-white p-4 flex items-center gap-3">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-masters-green-light flex items-center justify-center shrink-0">
            {headshot && imgOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headshot}
                alt={player?.name}
                onError={() => setImgOk(false)}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-serif font-bold text-masters-green text-lg">{initials}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-lg leading-tight truncate">{player?.name}</div>
            <div className="text-white/70 text-xs">
              {player?.rank != null ? `World #${player.rank}` : 'Unranked'}
              {data?.earningsRank ? ` · ${data.earningsRank} in earnings` : ''}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl px-1 shrink-0">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {status === 'loading' && (
            <p className="text-sm text-gray-400 text-center py-6">Loading scouting report…</p>
          )}
          {status === 'none' && (
            <p className="text-sm text-gray-400 text-center py-6">
              No live profile for this player yet (the field isn’t loaded).
            </p>
          )}
          {status === 'error' && (
            <p className="text-sm text-gray-400 text-center py-6">Couldn’t load this player’s data.</p>
          )}

          {status === 'ok' && (
            <>
              {data.season && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Season
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label="Events" value={data.season.events} />
                    <Stat label="Cuts Made" value={data.season.cuts} />
                    <Stat label="Top 10" value={data.season.top10} />
                    <Stat label="Wins" value={data.season.wins} />
                    <Stat label="Scoring Avg" value={data.season.avg} />
                    <Stat label="Earnings" value={data.season.earnings} />
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Last 5 Finishes
                </div>
                {data.recent?.length ? (
                  data.recent.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 py-1.5 text-sm border-t border-masters-green-light/50 first:border-0"
                    >
                      <span
                        className={`w-10 shrink-0 font-bold ${
                          r.finish === '1' ? 'text-masters-gold' : 'text-masters-green'
                        }`}
                      >
                        {r.finish || '—'}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-gray-700">{r.event}</span>
                      <span className="text-gray-400 text-xs tabular-nums shrink-0">{r.score || ''}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">No recent results.</p>
                )}
              </div>
            </>
          )}

          {canPick && onDraft && (
            <button disabled={busy} onClick={onDraft} className="btn-gold w-full">
              Draft {player?.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-masters-green-light/40 rounded-lg py-2">
      <div className="font-serif text-base text-masters-green leading-none">{value ?? '—'}</div>
      <div className="text-[9px] uppercase tracking-wide text-gray-500 mt-1">{label}</div>
    </div>
  );
}
