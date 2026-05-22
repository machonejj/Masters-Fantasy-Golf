// Fetches and normalizes the current PGA golf leaderboard from ESPN's public
// site API (no key required). Returns one row per competitor.
const ESPN_URL =
  'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga';

export async function fetchEspnLeaderboard() {
  const res = await fetch(ESPN_URL, { next: { revalidate: 0 }, cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
  const data = await res.json();

  const event = data.events?.[0];
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors || [];

  const rows = competitors.map((c) => {
    const name = c.athlete?.displayName || c.athlete?.fullName || '';
    const score = c.score?.displayValue ?? c.score ?? null; // e.g. "-5", "E", "+3"
    const statusType = c.status?.type?.name || '';
    let status = 'active';
    if (/withdraw/i.test(statusType) || c.status?.type?.shortDetail === 'WD') status = 'wd';
    if (/\bcut\b/i.test(statusType) || c.status?.type?.description === 'Cut') status = 'cut';

    // Per-round strokes (raw); golferTotal() converts these using course par.
    const linescores = (c.linescores || []).map((ls) =>
      ls.value !== undefined ? Number(ls.value) : null
    );

    return {
      name,
      score: typeof score === 'number' ? String(score) : score,
      thru: c.status?.thru != null ? String(c.status.thru) : c.status?.type?.shortDetail || null,
      status,
      rounds: linescores,
    };
  });

  return {
    tournament: event?.name || null,
    updatedAt: new Date().toISOString(),
    competitors: rows.filter((r) => r.name),
  };
}
