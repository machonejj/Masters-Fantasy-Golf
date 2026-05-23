// Fetches and normalizes PGA golf data from ESPN's public site API (no key).
//   • fetchEspnLeaderboard() — the current event's field + per-round to-par.
//   • fetchEspnScorecard()   — one player's round + hole-by-hole detail.
const LEADERBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga';
const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const CORE_URL = 'https://sports.core.api.espn.com/v2/sports/golf/leagues/pga';

// The PGA season schedule from the scoreboard "calendar" — every event with its
// id, name, and dates. Used by the admin tournament picker.
export async function fetchEspnSchedule() {
  const res = await fetch(SCOREBOARD_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
  const data = await res.json();
  const calendar = data.leagues?.[0]?.calendar || [];
  const events = [];
  for (const c of calendar) {
    if (!c || typeof c !== 'object') continue;
    const id = (c.event?.$ref || '').match(/\/events\/(\d+)/)?.[1] || null;
    if (!id) continue;
    events.push({
      id,
      label: c.label || '',
      startDate: c.startDate || null,
      endDate: c.endDate || null,
    });
  }
  return { events, currentEventId: data.events?.[0]?.id || null };
}

// "-5" → -5, "E" → 0, "+3" → 3, null/"" → null
export function parseToPar(s) {
  if (s === null || s === undefined) return null;
  const v = String(s).trim();
  if (v === '' || v === '-' || v === '--') return null;
  if (/^e$/i.test(v)) return 0;
  const n = parseInt(v.replace('+', ''), 10);
  return Number.isNaN(n) ? null : n;
}

// -5 → "-5", 0 → "E", 3 → "+3", null → null
function formatToPar(n) {
  if (n === null || n === undefined) return null;
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : String(n);
}

// Holes played in the current round → "F" once complete, the hole number while
// playing, or a tee time / "—" before they've started. ESPN reports thru=0 for a
// player who hasn't teed off (e.g. scheduled for the next round) — we must NOT
// treat that as "thru 0 holes" (it read as a live "0" and kept the finished round
// looking live), so thru=0 falls through to the tee time.
function thruLabel(status) {
  const t = status?.type;
  const thru = status?.thru;
  if (thru >= 18 || /finish|complete|final|post/i.test(t?.name || '')) return 'F';
  if (thru != null && thru > 0) return String(thru);
  return t?.shortDetail || '—';
}

export async function fetchEspnLeaderboard(eventId = null) {
  const url = eventId
    ? `${LEADERBOARD_URL}&event=${encodeURIComponent(eventId)}`
    : LEADERBOARD_URL;
  const res = await fetch(url, { next: { revalidate: 0 }, cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
  const data = await res.json();

  const event = data.events?.[0];
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors || [];
  const course = event?.courses?.[0];
  const coursePar = course?.shotsToPar ?? null;

  const rows = competitors.map((c, i) => {
    const name = c.athlete?.displayName || c.athlete?.fullName || '';
    // ESPN marks a missed-cut player with type.name "STATUS_CUT" and
    // description "Missed Cut" (shortDetail "CUT"); a withdrawal carries the same
    // STATUS_CUT name but description "Withdrawn". Match loosely so we don't miss
    // either (the old /\bcut\b/ never matched "STATUS_CUT", so nobody was cut).
    const st = c.status?.type || {};
    const statusName = st.name || '';
    const statusDesc = st.description || '';
    const statusShort = st.shortDetail || '';
    let status = 'active';
    if (/cut/i.test(statusName) || /cut/i.test(statusDesc) || statusShort === 'CUT') status = 'cut';
    // Check withdrawal last so it wins when both flags are present.
    if (/withdraw/i.test(statusName) || /withdraw/i.test(statusDesc) || statusShort === 'WD') status = 'wd';

    // Per-round TO-PAR straight from ESPN's linescores. Each played round carries
    // a displayValue ("-4", "E", "+2"); a round mid-play shows its to-par so far,
    // and not-yet-started rounds are placeholder entries with no `value` (skipped).
    const rounds = (c.linescores || [])
      .filter((ls) => ls && ls.value !== undefined)
      .map((ls) => parseToPar(ls.displayValue));

    // Running to-par = sum of the round scores. This is what the leaderboard
    // shows live; ESPN's own top-level `score` field lags a round mid-play.
    const total = rounds.length ? rounds.reduce((a, b) => a + (b ?? 0), 0) : null;

    return {
      name,
      athleteId: c.athlete?.id ?? c.id ?? null,
      total,
      score: formatToPar(total),
      thru: thruLabel(c.status),
      inProgress: /in_progress/i.test(statusName),
      status,
      rounds,
      sortOrder: c.sortOrder ?? i, // ESPN's leaderboard order
    };
  });

  // Projected cut line, straight from ESPN (e.g. top 70 & ties at -6 after R2).
  const t = event?.tournament;
  const cut =
    t && t.cutScore !== undefined && t.cutScore !== null
      ? {
          round: t.cutRound ?? null,
          score: typeof t.cutScore === 'number' ? t.cutScore : parseToPar(t.cutScore),
          count: t.cutCount ?? null,
        }
      : null;

  return {
    tournament: event?.name || null,
    eventId: event?.id || null,
    competitionId: competition?.id || null,
    coursePar,
    cut,
    course: course
      ? { name: course.name, city: course.address?.city, state: course.address?.state }
      : null,
    dates: { start: event?.date || null, end: event?.endDate || null },
    updatedAt: new Date().toISOString(),
    competitors: rows.filter((r) => r.name),
  };
}

// A competitor's [r1, r2, r3, r4] as TO-PAR values for the golfers table.
// rounds already holds per-round to-par (live round = to-par so far), so
// golferTotal() sums them straight to the player's current standing.
export function espnToParRounds(c) {
  const r = c?.rounds || [];
  return [r[0] ?? null, r[1] ?? null, r[2] ?? null, r[3] ?? null];
}

// One player's full scorecard from ESPN's core API: each round with its
// per-hole strokes, par, and score type (PAR/BIRDIE/BOGEY/EAGLE…). The hole
// `period` is the real hole number, so two-tee starts sort back to 1–18.
export async function fetchEspnScorecard(athleteId, eventId, competitionId) {
  const url = `${CORE_URL}/events/${eventId}/competitions/${competitionId}/competitors/${athleteId}/linescores`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN scorecard responded ${res.status}`);
  const data = await res.json();

  const rounds = (data.items || []).map((rd) => {
    const holes = (rd.linescores || [])
      .filter((h) => h.value !== undefined && h.par !== undefined)
      .map((h) => ({
        hole: h.period,
        par: h.par,
        strokes: h.value,
        toPar: h.value - h.par,
        type: h.scoreType?.name || null, // PAR | BIRDIE | BOGEY | EAGLE | DOUBLE_BOGEY …
      }))
      .sort((a, b) => a.hole - b.hole);

    return {
      round: rd.period,
      toPar: parseToPar(rd.displayValue),
      strokes: rd.value ?? null,
      holesPlayed: holes.length,
      complete: holes.length >= 18,
      holes,
    };
  });

  return { rounds };
}
