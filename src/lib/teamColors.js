// Stable, subtly-distinct team colors so each team is easy to follow across The
// Field, Standings, and the Draft Room. Seed with the team's draft_position —
// the same team always gets the same color everywhere.
//
// Muted, earthy Augusta-ish palette (pine, fairway, sand, gold, azalea, pond)
// so it vibes with the Masters theme instead of looking like neon highlighters.
//
// IMPORTANT: Tailwind's JIT scans source text for COMPLETE class strings — it
// can't see classes built by concatenation. So every class is written out in
// full literals below (text / bg-tint / dot / all-border / left-border).
const PALETTE = [
  { hex: '#3a6b47', text: 'text-[#3a6b47]', bg: 'bg-[#3a6b47]/15', dot: 'bg-[#3a6b47]', border: 'border-[#3a6b47]', borderL: 'border-l-[#3a6b47]' }, // pine green
  { hex: '#a8842c', text: 'text-[#a8842c]', bg: 'bg-[#a8842c]/15', dot: 'bg-[#a8842c]', border: 'border-[#a8842c]', borderL: 'border-l-[#a8842c]' }, // augusta gold
  { hex: '#b05f3a', text: 'text-[#b05f3a]', bg: 'bg-[#b05f3a]/15', dot: 'bg-[#b05f3a]', border: 'border-[#b05f3a]', borderL: 'border-l-[#b05f3a]' }, // clay
  { hex: '#b14a5b', text: 'text-[#b14a5b]', bg: 'bg-[#b14a5b]/15', dot: 'bg-[#b14a5b]', border: 'border-[#b14a5b]', borderL: 'border-l-[#b14a5b]' }, // azalea
  { hex: '#7a4f8a', text: 'text-[#7a4f8a]', bg: 'bg-[#7a4f8a]/15', dot: 'bg-[#7a4f8a]', border: 'border-[#7a4f8a]', borderL: 'border-l-[#7a4f8a]' }, // plum
  { hex: '#44688f', text: 'text-[#44688f]', bg: 'bg-[#44688f]/15', dot: 'bg-[#44688f]', border: 'border-[#44688f]', borderL: 'border-l-[#44688f]' }, // pond blue
  { hex: '#2f7d70', text: 'text-[#2f7d70]', bg: 'bg-[#2f7d70]/15', dot: 'bg-[#2f7d70]', border: 'border-[#2f7d70]', borderL: 'border-l-[#2f7d70]' }, // teal
  { hex: '#6f7a30', text: 'text-[#6f7a30]', bg: 'bg-[#6f7a30]/15', dot: 'bg-[#6f7a30]', border: 'border-[#6f7a30]', borderL: 'border-l-[#6f7a30]' }, // olive
  { hex: '#8a5a3c', text: 'text-[#8a5a3c]', bg: 'bg-[#8a5a3c]/15', dot: 'bg-[#8a5a3c]', border: 'border-[#8a5a3c]', borderL: 'border-l-[#8a5a3c]' }, // bark
  { hex: '#993f63', text: 'text-[#993f63]', bg: 'bg-[#993f63]/15', dot: 'bg-[#993f63]', border: 'border-[#993f63]', borderL: 'border-l-[#993f63]' }, // berry
  { hex: '#566773', text: 'text-[#566773]', bg: 'bg-[#566773]/15', dot: 'bg-[#566773]', border: 'border-[#566773]', borderL: 'border-l-[#566773]' }, // slate
  { hex: '#6f8f4f', text: 'text-[#6f8f4f]', bg: 'bg-[#6f8f4f]/15', dot: 'bg-[#6f8f4f]', border: 'border-[#6f8f4f]', borderL: 'border-l-[#6f8f4f]' }, // sage
];

const NEUTRAL = {
  hex: null,
  text: 'text-gray-400',
  bg: 'bg-transparent',
  dot: 'bg-gray-300',
  border: 'border-transparent',
  borderL: 'border-l-transparent',
};

// seed: a stable per-team number (draft_position works well). null → neutral.
export function teamColor(seed) {
  if (seed === null || seed === undefined) return NEUTRAL;
  const i = Math.trunc(Number(seed));
  if (Number.isNaN(i)) return NEUTRAL;
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}
