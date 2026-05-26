'use client';

// Shown to a player who's benched for the current tournament. Their login still
// works and they can follow the field, standings, and feed — they just have no
// team this week. The banner makes that intentional rather than confusing.
export default function SittingOutNotice({ participants, userId, tournament }) {
  const me = (participants || []).find((p) => p.user_id === userId);
  if (!me?.sitting_out) return null;

  return (
    <div className="card bg-masters-gold-pale border-masters-gold mb-4 flex items-start gap-2.5">
      <span className="text-xl leading-none">🪑</span>
      <p className="text-sm text-masters-green">
        <b>You&apos;re sitting out{tournament ? ` ${tournament}` : ' this tournament'}.</b> No team
        this week — but your code still works and you can follow all the action here. You&apos;ll be
        back in for the next draft.
      </p>
    </div>
  );
}
