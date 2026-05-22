// Pure snake-draft helpers — shared by client pages and server API routes.

export function orderedParticipants(participants) {
  return [...participants].sort((a, b) => a.draft_position - b.draft_position);
}

// Which participant is on the clock for a given zero-based overall pick index.
// Snake order: round 0 goes 1→N, round 1 goes N→1, and so on.
export function snakePicker(pickIdx, participants) {
  const ordered = orderedParticipants(participants);
  const n = ordered.length;
  if (n === 0) return null;
  const round = Math.floor(pickIdx / n);
  const posInRound = pickIdx % n;
  const idx = round % 2 === 0 ? posInRound : n - 1 - posInRound;
  return ordered[idx] || null;
}

export function totalPicks(participants, golfersPerTeam) {
  return participants.length * golfersPerTeam;
}

export function isDraftComplete(draftState, participants, golfersPerTeam) {
  return (draftState?.current_pick ?? 0) >= totalPicks(participants, golfersPerTeam);
}

// Best undrafted golfer = lowest rank number not yet taken. Used for auto-pick.
export function bestAvailableGolfer(golfers, picks) {
  const taken = new Set(picks.map((p) => p.golfer_id));
  const available = golfers.filter((g) => !taken.has(g.id));
  if (available.length === 0) return null;
  return available
    .slice()
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))[0];
}

// Builds the upcoming snake order (a few picks ahead) for the draft board.
export function upcomingPicks(currentPick, participants, golfersPerTeam, count = 8) {
  const total = totalPicks(participants, golfersPerTeam);
  const out = [];
  for (let i = currentPick; i < Math.min(currentPick + count, total); i++) {
    out.push({ pickIndex: i, participant: snakePicker(i, participants) });
  }
  return out;
}
