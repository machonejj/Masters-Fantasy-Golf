// SERVER-ONLY. Official World Golf Ranking (OWGR) — a free, key-less source used
// as a "favorites" proxy to order a freshly-loaded field (lower rank = better).
// Returns an empty map if OWGR is unreachable, so callers fall back to ESPN order.
const OWGR_URL =
  'https://apiweb.owgr.com/api/owgr/rankings/getRankings?regionId=0&pageSize=2000&pageNumber=1&countryId=0&sortString=Rank+ASC';

// Normalize a player name for cross-source matching: lowercase, strip accents and
// punctuation, collapse spaces. e.g. "Rasmus Hojgaard" -> "rasmus hojgaard".
export function normalizeName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Map of normalized name -> OWGR world rank (1 = best).
export async function fetchWorldRankings() {
  try {
    const res = await fetch(OWGR_URL, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map();
    for (const row of data.rankingsList || []) {
      const name = row.player?.fullName;
      if (name && row.rank) map.set(normalizeName(name), row.rank);
    }
    return map;
  } catch {
    return new Map();
  }
}
