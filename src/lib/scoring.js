// Pure scoring helpers — shared by client pages and server API routes.

// Total to-par for a single golfer across the rounds entered.
// Round values may be stored as to-par (e.g. -3, +2) OR raw strokes (e.g. 71);
// any |value| > 30 is treated as raw strokes and converted using course par.
// Cut / withdrawn golfers score the configured cut penalty.
export function golferTotal(g, { coursePar = 72, cutPenalty = 16 } = {}) {
  if (!g) return null;
  if (g.status === 'cut' || g.status === 'wd') return cutPenalty;
  const rs = [g.r1, g.r2, g.r3, g.r4].filter(
    (v) => v !== null && v !== undefined && v !== ''
  );
  if (rs.length === 0) return null;
  const isRawStrokes = rs.some((v) => Math.abs(Number(v)) > 30);
  if (isRawStrokes) {
    return rs.reduce((a, b) => a + (Number(b) - coursePar), 0);
  }
  return rs.reduce((a, b) => a + Number(b), 0);
}

// Everything a participant's team needs for display + standings.
// teamScore = sum of the best `counting_scores` golfer totals (lower is better).
export function teamData(participantId, picks, golfers, settings = {}) {
  const counting = settings.counting_scores ?? 3;
  const opts = {
    coursePar: settings.course_par ?? 72,
    cutPenalty: settings.cut_penalty ?? 16,
  };

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
