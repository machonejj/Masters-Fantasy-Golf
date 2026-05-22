'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePoolData } from '@/lib/usePoolData';
import { Loading, PageHeader } from '@/app/page';
import { snakePicker, totalPicks, isDraftComplete } from '@/lib/draft';

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
  const { loading, profile, settings, participants, golfers, picks, refresh, supabase } =
    usePoolData({ pollMs: 10000 });
  const [profiles, setProfiles] = useState([]);
  const [msg, setMsg] = useState(null); // {type, text}
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, display_name, email')
      .then(({ data }) => setProfiles(data || []));
  }, [supabase]);

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
        Admin access required. Ask the pool owner to promote your account.
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

      <DraftControls
        settings={settings}
        participants={participants}
        busy={busy}
        run={run}
        flash={flash}
      />
      <Participants
        participants={participants}
        profiles={profiles}
        settings={settings}
        busy={busy}
        run={run}
      />
      <Scores
        golfers={golfers}
        picks={picks}
        settings={settings}
        busy={busy}
        run={run}
        flash={flash}
      />
      <Settings settings={settings} busy={busy} run={run} flash={flash} />
    </div>
  );
}

/* ── Draft controls ──────────────────────────────────────────── */
function DraftControls({ settings, participants, busy, run, flash }) {
  const status = settings?.status;
  const gpt = settings?.golfers_per_team ?? 6;
  const complete = settings && isDraftComplete(settings, participants, gpt);
  const onClock =
    settings && !complete ? snakePicker(settings.current_pick, participants) : null;
  const total = totalPicks(participants, gpt);

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
        Each pick has a {Math.round((settings?.pick_timer_seconds ?? 3600) / 60)}-minute clock; on
        timeout the best available golfer is auto-drafted.
      </p>
    </div>
  );
}

/* ── Participants ────────────────────────────────────────────── */
function Participants({ participants, profiles, settings, busy, run }) {
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const draftRunning = settings?.status === 'active' || settings?.status === 'paused';

  const linkedUserIds = new Set(participants.map((p) => p.user_id).filter(Boolean));
  const availableProfiles = profiles.filter((p) => !linkedUserIds.has(p.id));

  function add() {
    const chosen = profiles.find((p) => p.id === userId);
    const display = chosen?.display_name || name;
    run(async () => {
      await api('/api/admin/participants', 'POST', {
        display_name: display,
        user_id: userId || null,
      });
      setName('');
      setUserId('');
    });
  }

  return (
    <div className="card">
      <div className="card-title">Participants ({participants.length})</div>

      <div className="space-y-1 mb-4">
        {participants.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-2 py-1.5 border-b border-masters-green-light/60 last:border-0"
          >
            <span className="w-6 text-center text-sm font-bold text-masters-green">
              {p.draft_position}
            </span>
            <span className="flex-1 text-sm">
              {p.display_name}
              {!p.user_id && (
                <span className="chip bg-gray-100 text-gray-400 ml-2">no login</span>
              )}
            </span>
            <button
              disabled={busy || i === 0}
              onClick={() => run(() => api('/api/admin/participants', 'PATCH', { action: 'move', id: p.id, direction: 'up' }))}
              className="btn-outline btn-sm"
            >
              ↑
            </button>
            <button
              disabled={busy || i === participants.length - 1}
              onClick={() => run(() => api('/api/admin/participants', 'PATCH', { action: 'move', id: p.id, direction: 'down' }))}
              className="btn-outline btn-sm"
            >
              ↓
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run(() => api(`/api/admin/participants?id=${p.id}`, 'DELETE'))
              }
              className="btn-danger btn-sm"
            >
              ✕
            </button>
          </div>
        ))}
        {participants.length === 0 && (
          <p className="text-sm text-gray-400">No participants yet.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Add registered user</label>
          <select
            className="input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">— pick a signed-up user —</option>
            {availableProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} ({p.email})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="label">…or a name only</label>
          <input
            className="input"
            placeholder="Guest team"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!userId}
          />
        </div>
        <button disabled={busy || (!name && !userId)} onClick={add} className="btn-primary">
          Add
        </button>
        <button
          disabled={busy || draftRunning || participants.length < 2}
          onClick={() =>
            run(() => api('/api/admin/participants', 'PATCH', { action: 'shuffle' }))
          }
          className="btn-gold"
          title={draftRunning ? 'Cannot reorder mid-draft' : 'Randomize draft order'}
        >
          🎲 Shuffle order
        </button>
      </div>
    </div>
  );
}

/* ── Scores / field ──────────────────────────────────────────── */
function Scores({ golfers, picks, settings, busy, run, flash }) {
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const draftedIds = useMemo(() => new Set(picks.map((p) => p.golfer_id)), [picks]);

  const rows = useMemo(
    () =>
      golfers
        .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 250),
    [golfers, search]
  );

  return (
    <div className="card">
      <div className="card-title">Field &amp; Scores ({golfers.length})</div>

      <div className="flex flex-wrap gap-2 mb-4">
        {golfers.length === 0 && (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await api('/api/admin/golfers', 'POST', { action: 'seed' });
                flash('ok', `Loaded ${r.inserted} golfers.`);
              })
            }
            className="btn-primary"
          >
            ⬇ Load default field
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await api('/api/admin/golfers', 'POST', { action: 'syncLive' });
              flash('ok', `Synced ${r.updated} golfers from ESPN${r.tournament ? ` (${r.tournament})` : ''}.`);
            })
          }
          className="btn-gold"
        >
          ↻ Pull live scores (ESPN)
        </button>
        {golfers.length > 0 && (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (!window.confirm('Clear the entire field?')) return;
                await api('/api/admin/golfers?all=true', 'DELETE');
                flash('ok', 'Field cleared.');
              })
            }
            className="btn-danger"
          >
            Clear field
          </button>
        )}
        <div className="flex gap-2 items-end ml-auto">
          <input
            className="input !py-1.5 max-w-[150px]"
            placeholder="Add golfer…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            disabled={busy || !newName.trim()}
            onClick={() =>
              run(async () => {
                await api('/api/admin/golfers', 'POST', { action: 'add', name: newName.trim() });
                setNewName('');
              })
            }
            className="btn-outline btn-sm"
          >
            +
          </button>
        </div>
      </div>

      {golfers.length > 0 && (
        <>
          <input
            className="input mb-3"
            placeholder="Filter golfers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="text-xs text-gray-400 mb-2">
            Enter each round as to-par (e.g. -3, 2) or raw strokes (e.g. 69). Save per row.
          </p>
          <div className="max-h-[420px] overflow-y-auto -mx-1 px-1">
            {rows.map((g) => (
              <GolferRow key={g.id} g={g} drafted={draftedIds.has(g.id)} busy={busy} run={run} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GolferRow({ g, drafted, busy, run }) {
  const [form, setForm] = useState({
    r1: g.r1 ?? '',
    r2: g.r2 ?? '',
    r3: g.r3 ?? '',
    r4: g.r4 ?? '',
    status: g.status,
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex items-center gap-1.5 py-1.5 border-b border-masters-green-light/60 last:border-0">
      <span className="w-44 text-sm truncate" title={g.name}>
        <span className="text-xs text-gray-400 mr-1">#{g.rank ?? '–'}</span>
        {g.name}
      </span>
      {['r1', 'r2', 'r3', 'r4'].map((r) => (
        <input
          key={r}
          className="input !p-1 !w-12 text-center text-xs"
          value={form[r]}
          onChange={set(r)}
          placeholder={r.toUpperCase()}
        />
      ))}
      <select className="input !p-1 !w-20 text-xs" value={form.status} onChange={set('status')}>
        <option value="active">active</option>
        <option value="cut">cut</option>
        <option value="wd">wd</option>
      </select>
      <button
        disabled={busy}
        onClick={() => run(() => api('/api/admin/golfers', 'PATCH', { id: g.id, ...form }))}
        className="btn-primary btn-sm"
      >
        Save
      </button>
      {!drafted && (
        <button
          disabled={busy}
          onClick={() => run(() => api(`/api/admin/golfers?id=${g.id}`, 'DELETE'))}
          className="btn-danger btn-sm"
        >
          ✕
        </button>
      )}
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
          pick_timer_seconds: Math.max(60, Number(form.pick_timer_minutes) * 60),
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
        <Field label="Pick timer (min)">
          <input type="number" className="input" value={form.pick_timer_minutes} onChange={set('pick_timer_minutes')} />
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
