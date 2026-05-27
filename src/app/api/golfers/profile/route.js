import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

// Pre-tournament player card data for the Draft Room: recent finishes + season
// summary, straight from ESPN's athlete "overview". Read-only; any signed-in user.
const OVERVIEW = (id) =>
  `https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/athletes/${id}/overview`;

export async function GET(request) {
  const ctx = await requireUser();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const res = await fetch(OVERVIEW(id), {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) return NextResponse.json({ error: 'profile unavailable' }, { status: 502 });
    const d = await res.json();

    // Recent finishes — flatten every tournament group, newest first, top 5.
    const recent = [];
    for (const grp of d.recentTournaments || []) {
      for (const ev of grp.eventsStats || []) {
        const comp = ev.competitions?.[0]?.competitors?.[0];
        recent.push({
          event: ev.shortName || ev.name || '—',
          date: ev.date || ev.endDate || null,
          finish: comp?.status?.position?.displayName || null,
          score: comp?.score?.displayValue || null,
        });
      }
    }
    recent.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    // Season summary from the statistics splits, aligned to the label list
    // (EVENTS, CUTS, TOP10, WINS, AVG, EARNINGS).
    let season = null;
    const st = d.statistics;
    if (st?.labels?.length && st?.splits?.length) {
      const split = st.splits.find((s) => Array.isArray(s.stats) && s.stats.length);
      if (split) {
        const v = {};
        st.labels.forEach((lab, i) => (v[lab] = split.stats[i]));
        season = {
          events: v.EVENTS ?? null,
          cuts: v.CUTS ?? null,
          top10: v.TOP10 ?? null,
          wins: v.WINS ?? null,
          avg: v.AVG ?? null,
          earnings: v.EARNINGS ?? null,
        };
      }
    }

    const money = (d.seasonRankings?.categories || []).find((c) => c.name === 'amount');

    return NextResponse.json({
      recent: recent.slice(0, 5),
      season,
      earningsRank: money?.rankDisplayValue || null,
    });
  } catch {
    return NextResponse.json({ error: 'profile unavailable' }, { status: 502 });
  }
}
