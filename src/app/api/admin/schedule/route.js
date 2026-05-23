import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { fetchEspnSchedule } from '@/lib/espn';
import { getActiveEventId } from '@/lib/activeEvent';

// The PGA season schedule for the admin tournament picker, plus which event the
// pool is currently set to.
export async function GET() {
  const ctx = await requireAdmin();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const schedule = await fetchEspnSchedule();
    const activeEventId = await getActiveEventId();
    return NextResponse.json({ ...schedule, activeEventId });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Schedule unavailable.' }, { status: 502 });
  }
}
