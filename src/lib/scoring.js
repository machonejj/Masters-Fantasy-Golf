// Pure scoring helpers — shared by client pages and server API routes.

// A cut / withdrawn golfer is charged this many strokes over par for every round
// they don't play. E.g. cut after R2 → +8 for R3 and +8 for R4 on top of their
// actual R1+R2 to-par.
export const CUT_ROUND_PENALTY = 8;
const TOURNAMENT_ROUNDS = 4;

// To-par for a list of round values, handling both to-par (e.g. -3, +2) and raw
// strokes (any |value| > 30, converted with course par). Returns the running
// to-par plus how many rounds actually had a score.
function sumRounds(roundVals, coursePar) {
  const rs = roundVals.filter((v) => v !== null && v !== undefined && v !== '');
  if (rs.length === 0) return { sum: 0, played: 0 };
  const isRawStrokes = rs.some((v) => Math.abs(Number(v)) > 30);
  const sum = isRawStrokes
    ? rs.reduce((a, b) => a + (Number(b) - coursePar), 0)
    : rs.reduce((a, b) => a + Number(b), 0);
  return { sum, played: rs.length };
}

// Penalty-adjusted to-par from a list of round values + a status. A cut/withdrawn
// golfer keeps the rounds they played and is charged CUT_ROUND_PENALTY for each
// round they didn't (so each missed round reads as +8). Active golfers with no
// score yet return null.
export function adjustedTotal(
  roundVals,
  status,
  { coursePar = 72, cutRoundPenalty = CUT_ROUND_PENALTY } = {}
) {
  const { sum, played } = sumRounds(roundVals, coursePar);
  if (status === 'cut' || status === 'wd') {
    return sum + Math.max(0, TOURNAMENT_ROUNDS - played) * cutRoundPenalty;
  }
  return played === 0 ? null : sum;
}

// Total to-par for a single stored golfer (its r1–r4 + status).
export function golferTotal(g, opts = {}) {
  if (!g) return null;
  return adjustedTotal([g.r1, g.r2, g.r3, g.r4], g.status, opts);
}

// 0-based index of the round a golfer is actively playing right now — the last
// round that has a score, but only while they're mid-round (`thru` is a hole
// count, not "F"/a tee time, and they're not cut/withdrawn). That round's score
// is still moving; every earlier round is final. Returns -1 when nothing is live.
export function liveRoundIndex(roundVals, thru, status) {
  if (status === 'cut' || status === 'wd') return -1;
  if (!/^\d+$/.test(String(thru ?? ''))) return -1;
  let last = -1;
  roundVals.forEach((v, i) => {
    if (v !== null && v !== undefined && v !== '') last = i;
  });
  return last;
}

// Everything a participant's team needs for display + standings.
// teamScore = sum of the best `counting_scores` golfer totals (lower is better).
export function teamData(participantId, picks, golfers, settings = {}) {
  const counting = settings.counting_scores ?? 3;
  const opts = { coursePar: settings.course_par ?? 72 };

  const golferIds = picks
    .filter((p) => p.participant_id === participantId)
    .sort((a, b) => a.pick_number - b.pick_number)
    .map((p) => p.golfer_id);

  const teamGolfers = golferIds
    .map((id) => golfers.find((g) => g.id === id))
    .filter(Boolean);

  const withScores = teamGolfers.map((g) => ({ g, score: golferTotal(g, opts) }));
  const ranked = withScores
    .filter((x) => x.score !== null)
    .sort((a, b) => a.score - b.score);

  const countingRows = ranked.slice(0, counting);
  const countingSet = new Set(countingRows.map((x) => x.g.id));
  const teamScore = countingRows.length
    ? countingRows.reduce((a, x) => a + x.score, 0)
    : null;

  return { golfers: teamGolfers, withScores, countingSet, teamScore };
}

// "+3", "E", "-2", or "—" for an empty score.
export function scoreText(s) {
  if (s === null || s === undefined) return '—';
  if (s === 0) return 'E';
  return s > 0 ? `+${s}` : String(s);
}

// Tailwind text color class for a to-par value.
export function scoreColor(s) {
  if (s === null || s === undefined) return 'text-gray-400';
  if (s < 0) return 'text-score-under';
  if (s > 0) return 'text-score-over';
  return 'text-gray-700';
}
