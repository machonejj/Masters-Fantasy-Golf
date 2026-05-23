// Stable, distinct team colors so each team is easy to follow across The Field,
// Standings, and the Draft Room. Seed with the team's draft_position — the same
// team always gets the same color everywhere.
//
// Masters palette: shades of green and gold/yellow only, ordered to alternate
// green ↔ gold so adjacent teams contrast. All are dark enough to read as the
// owner labels on white. Class names are full literals so Tailwind's JIT keeps
// them (it can't see classes built by concatenation).
const PALETTE = [
  { hex: '#2f6b40', text: 'text-[#2f6b40]', bg: 'bg-[#2f6b40]/15', dot: 'bg-[#2f6b40]', border: 'border-[#2f6b40]', borderL: 'border-l-[#2f6b40]' }, // pine green
  { hex: '#b1851f', text: 'text-[#b1851f]', bg: 'bg-[#b1851f]/15', dot: 'bg-[#b1851f]', border: 'border-[#b1851f]', borderL: 'border-l-[#b1851f]' }, // gold
  { hex: '#4a9a3f', text: 'text-[#4a9a3f]', bg: 'bg-[#4a9a3f]/15', dot: 'bg-[#4a9a3f]', border: 'border-[#4a9a3f]', borderL: 'border-l-[#4a9a3f]' }, // grass green
  { hex: '#8a6620', text: 'text-[#8a6620]', bg: 'bg-[#8a6620]/15', dot: 'bg-[#8a6620]', border: 'border-[#8a6620]', borderL: 'border-l-[#8a6620]' }, // bronze
  { hex: '#5e7d2a', text: 'text-[#5e7d2a]', bg: 'bg-[#5e7d2a]/15', dot: 'bg-[#5e7d2a]', border: 'border-[#5e7d2a]', borderL: 'border-l-[#5e7d2a]' }, // moss
  { hex: '#b8901a', text: 'text-[#b8901a]', bg: 'bg-[#b8901a]/15', dot: 'bg-[#b8901a]', border: 'border-[#b8901a]', borderL: 'border-l-[#b8901a]' }, // goldenrod
  { hex: '#1f5e38', text: 'text-[#1f5e38]', bg: 'bg-[#1f5e38]/15', dot: 'bg-[#1f5e38]', border: 'border-[#1f5e38]', borderL: 'border-l-[#1f5e38]' }, // forest
  { hex: '#6f7a14', text: 'text-[#6f7a14]', bg: 'bg-[#6f7a14]/15', dot: 'bg-[#6f7a14]', border: 'border-[#6f7a14]', borderL: 'border-l-[#6f7a14]' }, // olive
  { hex: '#7a9b4f', text: 'text-[#7a9b4f]', bg: 'bg-[#7a9b4f]/15', dot: 'bg-[#7a9b4f]', border: 'border-[#7a9b4f]', borderL: 'border-l-[#7a9b4f]' }, // sage
  { hex: '#9c7a10', text: 'text-[#9c7a10]', bg: 'bg-[#9c7a10]/15', dot: 'bg-[#9c7a10]', border: 'border-[#9c7a10]', borderL: 'border-l-[#9c7a10]' }, // mustard
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
