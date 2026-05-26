// Pure helpers for the purse / payouts / career stats — shared by the close
// API route (server), the Admin purse log, and The Gallery (client). No React.

// Payout structures. Each is a list of shares (fractions of the purse) by finish
// position. Winner-take-all is the default; the others are here so the pool can
// switch later without code changes. Extend this list to add more.
export const PAYOUT_STRUCTURES = [
  { key: 'winner_take_all', label: 'Winner-Take-All', shares: [1] },
  { key: 'top_two', label: 'Top 2 (70 / 30)', shares: [0.7, 0.3] },
  { key: 'top_three', label: 'Top 3 (60 / 30 / 10)', shares: [0.6, 0.3, 0.1] },
];

export function payoutStructure(key) {
  return PAYOUT_STRUCTURES.find((s) => s.key === key) || PAYOUT_STRUCTURES[0];
}

export function payoutLabel(key) {
  return payoutStructure(key).label;
}

// Total pot = entry fee × patrons entered.
export function computePurse(buyIn, paidCount) {
  return (Number(buyIn) || 0) * (Number(paidCount) || 0);
}

// Lower to-par wins; teams with no score (null) sort last. Returns a new array
// with a 1-based `position` on each row (ties break by original order).
export function rankByScore(standings) {
  return [...standings]
    .sort((a, b) => {
      if (a.score === null || a.score === undefined) return 1;
      if (b.score === null || b.score === undefined) return -1;
      return a.score - b.score;
    })
    .map((row, i) => ({ ...row, position: i + 1 }));
}

// Splits the purse across the ranked standings per the payout structure, with any
// rounding remainder handed to the champion so the total always equals the purse.
// Returns the standings with a numeric `winnings` on each row.
export function computePayouts(rankedStandings, purse, structureKey) {
  const shares = payoutStructure(structureKey).shares;
  const pot = Number(purse) || 0;
  let assigned = 0;
  const out = rankedStandings.map((row) => {
    const share = shares[row.position - 1] || 0;
    const amount = Math.round(pot * share * 100) / 100;
    assigned += amount;
    return { ...row, winnings: amount };
  });
  // Give any rounding leftover to the champion (position 1).
  const remainder = Math.round((pot - assigned) * 100) / 100;
  if (remainder !== 0 && out.length) {
    const champ = out.find((r) => r.position === 1) || out[0];
    champ.winnings = Math.round((champ.winnings + remainder) * 100) / 100;
  }
  return out;
}

// A drafted golfer "made the cut" if they were still in the field at the end
// (status 'active' = completed / made the weekend). Cut or withdrawn = missed.
export function madeCut(status) {
  return status === 'active';
}

// "$1,250" / "$25" — whole dollars when even, two decimals otherwise.
export function formatMoney(n) {
  const v = Number(n) || 0;
  const opts = Number.isInteger(v)
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `$${v.toLocaleString('en-US', opts)}`;
}

// Aggregate every completed tournament into per-team career stats. `nameById`
// (optional) maps participant_id → current display name; falls back to the name
// snapshotted in each tournament. Returns rows sorted by earnings (desc).
export function careerStats(tournaments, nameById = {}) {
  const byTeam = new Map();

  for (const t of tournaments || []) {
    for (const s of t.standings || []) {
      const key = s.participant_id || `name:${s.name}`;
      let row = byTeam.get(key);
      if (!row) {
        row = {
          key,
          participantId: s.participant_id || null,
          name: nameById[s.participant_id] || s.name || '—',
          entered: 0,
          wins: 0,
          top3: 0,
          earnings: 0,
          finishes: [],
          bestFinish: null,
          draftedTotal: 0,
          madeCutCount: 0,
        };
        byTeam.set(key, row);
      }
      row.entered += 1;
      if (s.position === 1) row.wins += 1;
      if (s.position && s.position <= 3) row.top3 += 1;
      row.earnings += Number(s.winnings) || 0;
      if (s.position) {
        row.finishes.push(s.position);
        row.bestFinish = row.bestFinish === null ? s.position : Math.min(row.bestFinish, s.position);
      }
      const golfers = s.golfers || [];
      row.draftedTotal += golfers.length;
      row.madeCutCount += golfers.filter((g) => g.made_cut).length;
    }
  }

  return [...byTeam.values()]
    .map((r) => ({
      ...r,
      avgFinish: r.finishes.length
        ? r.finishes.reduce((a, b) => a + b, 0) / r.finishes.length
        : null,
      madeCutRate: r.draftedTotal ? r.madeCutCount / r.draftedTotal : null,
    }))
    .sort((a, b) => b.earnings - a.earnings || a.avgFinish - b.avgFinish);
}

export function formatPct(rate) {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
}

// 1 → "1st", 2 → "2nd", 11 → "11th", etc.
export function ordinal(n) {
  if (n === null || n === undefined) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Re-rank a tournament's standings around a chosen champion: that team goes to
// position 1, everyone else falls in by score, then payouts are recomputed.
// Shared by the "set champion" admin action. `championKey` matches participant_id
// (preferred) or name. Returns { standings, champion } or null if not found.
export function reseatChampion(standings, championKey, purse, structureKey) {
  const list = standings || [];
  const chosen = list.find((s) => (s.participant_id ?? `name:${s.name}`) === championKey);
  if (!chosen) return null;
  const others = rankByScore(list.filter((s) => s !== chosen));
  const reordered = [
    { ...chosen, position: 1 },
    ...others.map((o) => ({ ...o, position: o.position + 1 })),
  ];
  const paid = computePayouts(reordered, purse, structureKey);
  return { standings: paid, champion: chosen };
}
