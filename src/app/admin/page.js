'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { Loading, PageHeader } from '@/app/page';
import { snakePicker, totalPicks, isDraftComplete, activeParticipants } from '@/lib/draft';

async function api(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function AdminPage() {
  const { loading, profile, settings, participants, golfers, refresh } =
    usePoolData({ pollMs: 10000 });
  const [msg, setMsg] = useState(null); // {type, text}
  const [busy, setBusy] = useState(false);

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      flash('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!profile?.is_admin) {
    return (
      <div className="card text-center text-gray-600">
        Admin access required. Sign out and log in with the admin code to manage the pool.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Admin" subtitle="Run the pool" />

      {msg && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.type === 'error'
              ? 'bg-red-100 text-red-800'
              : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {msg.text}
        </div>
      )}

      <TournamentPicker settings={settings} golfers={golfers} busy={busy} run={run} flash={flash} />
      <DraftControls
        settings={settings}
        participants={participants}
        busy={busy}
        run={run}
        flash={flash}
      />
      <Participants
        participants={participants}
        settings={settings}
        busy={busy}
        run={run}
        flash={flash}
      />
      <Settings settings={settings} busy={busy} run={run} flash={flash} />
    </div>
  );
}

/* ── Tournament picker ───────────────────────────────────────── */
function TournamentPicker({ settings, golfers, busy, run, flash }) {
  const [schedule, setSchedule] = useState(null); // { events, activeEventId, currentEventId }
  const [sel, setSel] = useState('');

  useEffect(() => {
    api('/api/admin/schedule', 'GET')
      .then((d) => {
        setSchedule(d);
        setSel(d.activeEventId || d.currentEventId || '');
      })
      .catch(() => setSchedule({ events: [] }));
  }, []);

  const now = Date.now();
  const stateOf = (e) => {
    const s = e.startDate ? Date.parse(e.startDate) : 0;
    const end = e.endDate ? Date.parse(e.endDate) : s;
    if (now < s) return 'upcoming';
    if (now > end + 36 * 3600 * 1000) return 'past';
    return 'live';
  };
  const fmt = (d) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

  function setup(eventId) {
    const ev = schedule?.events.find((e) => e.id === eventId);
    run(async () => {
      if (
        !window.confirm(
          `Set up "${ev?.label}"?\n\nThis RESETS the current draft, clears the old field, and loads this tournament's field. The previous tournament's draft will be erased.`
        )
      )
        return;
      const r = await api('/api/admin/golfers', 'POST', { action: 'setupTournament', eventId });
      flash('ok', `Loaded ${r.tournament || ev?.label} — ${r.field} golfers. Ready to draft.`);
    });
  }

  function refreshField() {
    run(async () => {
      const r = await api('/api/admin/golfers', 'POST', { action: 'syncLive' });
      flash(
        'ok',
        `Field refreshed${r.tournament ? ` (${r.tournament})` : ''}: ${r.updated} updated, ${r.inserted} added.`
      );
    });
  }

  return (
    <div className="card">
      <div className="card-title">Tournament</div>
      <div className="text-sm mb-3">
        Active: <b className="text-masters-green">{settings?.tournament_name || '—'}</b>
        <span className="text-gray-400"> · {golfers.length} golfers in the field</span>
        {schedule && !schedule.activeEventId && (
          <span className="text-gray-400"> · following ESPN’s current event</span>
        )}
      </div>

      {!schedule ? (
        <p className="text-sm text-gray-400">Loading schedule…</p>
      ) : schedule.events.length === 0 ? (
        <p className="text-sm text-gray-400">Schedule unavailable right now.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="label">Pick a tournament (PGA season)</label>
              <select className="input" value={sel} onChange={(e) => setSel(e.target.value)}>
                {schedule.events.map((e) => {
                  const st = stateOf(e);
                  const tag = st === 'live' ? ' · live' : st === 'upcoming' ? ' · upcoming' : '';
                  return (
                    <option key={e.id} value={e.id}>
                      {fmt(e.startDate)} — {e.label}
                      {tag}
                    </option>
                  );
                })}
              </select>
            </div>
            <button
              disabled={busy || !sel || sel === (schedule.activeEventId || '')}
              onClick={() => setup(sel)}
              className="btn-primary"
            >
              Set up tournament
            </button>
            <button disabled={busy} onClick={refreshField} className="btn-gold">
              ↻ Refresh field
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Picking a tournament resets the draft and loads its field. Far-out events may show 0
            golfers until ESPN posts the field — use “Refresh field” as it gets closer.
          </p>
        </>
      )}
    </div>
  );
}

/* ── Draft controls ──────────────────────────────────────────── */
function DraftControls({ settings, participants, busy, run, flash }) {
  const status = settings?.status;
  const gpt = settings?.golfers_per_team ?? 6;
  const active = activeParticipants(participants); // players sitting out are skipped
  const complete = settings && isDraftComplete(settings, active, gpt);
  const onClock =
    settings && !complete ? snakePicker(settings.current_pick, active) : null;
  const total = totalPicks(active, gpt);

  const control = (action, confirmText) =>
    run(async () => {
      if (confirmText && !window.confirm(confirmText)) return;
      await api('/api/draft/control', 'POST', { action });
      flash('ok', `Draft ${action} done.`);
    });

  return (
    <div className="card">
      <div className="card-title">Draft Controls</div>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <span className="chip bg-masters-green-light text-masters-green capitalize">
          {status}
        </span>
        <span className="text-gray-500">
          Pick {Math.min((settings?.current_pick ?? 0) + 1, total || 1)} / {total || '—'}
        </span>
        {onClock && (
          <span className="text-gray-500">
            On the clock: <b className="text-masters-green">{onClock.display_name}</b>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {(status === 'pending' || status === 'complete') && (
          <button disabled={busy} onClick={() => control('start')} className="btn-primary">
            ▶ Start Draft
          </button>
        )}
        {status === 'active' && (
          <button disabled={busy} onClick={() => control('pause')} className="btn-gold">
            ⏸ Pause
          </button>
        )}
        {status === 'paused' && (
          <button disabled={busy} onClick={() => control('resume')} className="btn-primary">
            ▶ Resume
          </button>
        )}
        {(settings?.current_pick ?? 0) > 0 && (
          <button
            disabled={busy}
            onClick={() =>
              control(
                'undo',
                'Undo the last pick? It frees that golfer and puts that team back on the clock.'
              )
            }
            className="btn-outline"
          >
            ↶ Undo last pick
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            control('reset', 'Reset the draft? This deletes ALL picks and cannot be undone.')
          }
          className="btn-danger"
        >
          ↺ Reset Draft
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        {settings?.pick_timer_seconds > 0
          ? `Each pick has a ${Math.round(settings.pick_timer_seconds / 60)}-minute clock; on timeout the best available golfer is auto-drafted.`
          : 'No pick timer — picks have unlimited time. Set one in Pool Settings if you want a clock.'}
      </p>
    </div>
  );
}

/* ── Participants ────────────────────────────────────────────── */
function Participants({ participants, settings, busy, run, flash }) {
  const [name, setName] = useState('');
  const [codes, setCodes] = useState({}); // participantId → login code
  const [justCreated, setJustCreated] = useState(null); // { name, code }
  const draftRunning = settings?.status === 'active' || settings?.status === 'paused';

  // Split the roster: who's playing this tournament vs. sitting out (still in the
  // pool, just benched). Both come ordered by draft_position from usePoolData.
  const active = participants.filter((p) => !p.sitting_out);
  const benched = participants.filter((p) => p.sitting_out);

  // Sit a player out / bring them back. The server blocks this mid-draft.
  const setSittingOut = (id, sitting_out) =>
    run(() => api('/api/admin/participants', 'PATCH', { action: 'bench', id, sitting_out }));

  const loadCodes = useCallback(async () => {
    try {
      const r = await api('/api/admin/participants', 'GET');
      setCodes(r.codes || {});
    } catch {
      /* non-fatal: codes just won't show */
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes, participants.length]);

  function add() {
    const display = name.trim();
    if (!display) return;
    run(async () => {
      const r = await api('/api/admin/participants', 'POST', { display_name: display });
      setName('');
      setJustCreated({ name: r.participant?.display_name || display, code: r.code });
      await loadCodes();
    });
  }

  function copy(text) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => flash('ok', `Code ${text} copied to clipboard.`),
      () => {}
    );
  }

  // A ready-to-send message for a player: app URL (wherever this is hosted) + code.
  function copyInvite(playerName, code) {
    if (!code) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text =
      `⛳ You're in the Augusta Pickem pool${playerName ? `, ${playerName}` : ''}!\n\n` +
      `Log in here: ${origin}\n` +
      `Your access code: ${code}\n\n` +
      `Just enter the code — no password needed.`;
    navigator.clipboard?.writeText(text).then(
      () => flash('ok', `Invite for ${playerName} copied — paste it to them.`),
      () => {}
    );
  }

  // One player row — used by both the active roster and the sitting-out bench.
  // `i` is the index within the active list (for the up/down arrows); benched
  // rows hide the arrows since their order doesn't matter.
  const renderRow = (p, { isBenched = false } = {}) => (
    <div
      key={p.id}
      className={`flex items-center gap-2 py-1.5 border-b border-masters-green-light/60 last:border-0 ${
        isBenched ? 'opacity-70' : ''
      }`}
    >
      <span className="w-6 text-center text-sm font-bold text-masters-green">
        {isBenched ? '🪑' : p.draft_position}
      </span>
      <span className="flex-1 text-sm truncate">{p.display_name}</span>
      {codes[p.id] ? (
        <>
          <button
            onClick={() => copy(codes[p.id])}
            title="Click to copy the code"
            className="font-mono text-xs font-bold tracking-wider text-masters-green bg-masters-green-light/60 rounded px-2 py-1 hover:bg-masters-green-light"
          >
            {codes[p.id]}
          </button>
          <button
            onClick={() => copyInvite(p.display_name, codes[p.id])}
            title="Copy an invite message to send this player"
            className="btn-outline btn-sm"
          >
            ✉
          </button>
        </>
      ) : (
        <span className="chip bg-gray-100 text-gray-400">no code</span>
      )}
      <button
        disabled={busy || draftRunning}
        onClick={() => setSittingOut(p.id, !isBenched)}
        title={
          draftRunning
            ? 'Finish or reset the draft to change who’s sitting out'
            : isBenched
              ? 'Bring this player back into the tournament'
              : 'Sit this player out for this tournament (keeps them in the pool)'
        }
        className="btn-outline btn-sm whitespace-nowrap"
      >
        {isBenched ? '↩ Bring back' : '🪑 Sit out'}
      </button>
      <button
        disabled={busy}
        onClick={() =>
          run(async () => {
            if (!window.confirm(`Remove ${p.display_name}? Their login code will stop working.`))
              return;
            await api(`/api/admin/participants?id=${p.id}`, 'DELETE');
          })
        }
        className="btn-danger btn-sm"
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className="card">
      <div className="card-title">
        Players ({active.length} active{benched.length ? ` · ${benched.length} sitting out` : ''})
      </div>

      {justCreated && (
        <div className="bg-masters-green-light/70 border border-masters-green/20 rounded-lg p-3 mb-4">
          <div className="text-xs text-gray-500 mb-1">
            Created <b className="text-masters-green">{justCreated.name}</b>. Share this login
            code:
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-lg font-mono font-bold tracking-widest text-masters-green">
              {justCreated.code}
            </code>
            <button
              onClick={() => copyInvite(justCreated.name, justCreated.code)}
              className="btn-primary btn-sm"
            >
              Copy invite
            </button>
            <button onClick={() => copy(justCreated.code)} className="btn-outline btn-sm">
              Code
            </button>
            <button
              onClick={() => setJustCreated(null)}
              className="text-gray-400 text-sm px-1"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Active roster — these players draft and score this tournament */}
      <div className="space-y-1 mb-3">
        {active.map((p) => renderRow(p))}
        {active.length === 0 && (
          <p className="text-sm text-gray-400">
            {benched.length
              ? 'No active players. Bring someone back below, or add a new player.'
              : 'No players yet. Add one below to generate a code.'}
          </p>
        )}
      </div>

      {/* Sitting out — still in the pool, just skipped this tournament */}
      {benched.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
            Sitting out this tournament
          </div>
          <div className="space-y-1 rounded-lg bg-gray-50 border border-dashed border-gray-200 px-2">
            {benched.map((p) => renderRow(p, { isBenched: true }))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Add player</label>
          <input
            className="input"
            placeholder="Player name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </div>
        <button disabled={busy || !name.trim()} onClick={add} className="btn-primary">
          Add &amp; get code
        </button>
        <button
          disabled={busy || draftRunning || active.length < 2}
          onClick={() =>
            run(() => api('/api/admin/participants', 'PATCH', { action: 'shuffle' }))
          }
          className="btn-gold"
          title={draftRunning ? 'Cannot reorder mid-draft' : 'Randomize draft order'}
        >
          🎲 Shuffle order
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Each player logs in with their code at the sign-in screen — no email or password needed.
        Click a code to copy it. <b>Sit out</b> benches a player for this tournament without
        deleting them — bring them back anytime before the next draft.
      </p>
    </div>
  );
}

/* ── Pool settings ───────────────────────────────────────────── */
function Settings({ settings, busy, run, flash }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (settings && !form) {
      setForm({
        tournament_name: settings.tournament_name,
        golfers_per_team: settings.golfers_per_team,
        counting_scores: settings.counting_scores,
        cut_penalty: settings.cut_penalty,
        course_par: settings.course_par,
        pick_timer_minutes: Math.round(settings.pick_timer_seconds / 60),
      });
    }
  }, [settings, form]);

  if (!form) return null;
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function save() {
    run(async () => {
      await api('/api/draft/control', 'POST', {
        action: 'settings',
        settings: {
          tournament_name: form.tournament_name,
          golfers_per_team: Number(form.golfers_per_team),
          counting_scores: Number(form.counting_scores),
          cut_penalty: Number(form.cut_penalty),
          course_par: Number(form.course_par),
          pick_timer_seconds:
            Number(form.pick_timer_minutes) > 0
              ? Math.max(60, Number(form.pick_timer_minutes) * 60)
              : 0,
        },
      });
      flash('ok', 'Settings saved.');
    });
  }

  return (
    <div className="card">
      <div className="card-title">Pool Settings</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Tournament">
          <input className="input" value={form.tournament_name} onChange={set('tournament_name')} />
        </Field>
        <Field label="Golfers / team">
          <input type="number" className="input" value={form.golfers_per_team} onChange={set('golfers_per_team')} />
        </Field>
        <Field label="Counting (best N)">
          <input type="number" className="input" value={form.counting_scores} onChange={set('counting_scores')} />
        </Field>
        <Field label="Cut penalty (+)">
          <input type="number" className="input" value={form.cut_penalty} onChange={set('cut_penalty')} />
        </Field>
        <Field label="Course par">
          <input type="number" className="input" value={form.course_par} onChange={set('course_par')} />
        </Field>
        <Field label="Pick timer (min · 0 = none)">
          <input
            type="number"
            min="0"
            className="input"
            value={form.pick_timer_minutes}
            onChange={set('pick_timer_minutes')}
          />
        </Field>
      </div>
      <button disabled={busy} onClick={save} className="btn-primary mt-4">
        Save settings
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
