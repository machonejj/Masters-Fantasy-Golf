// Shared, app-wide pool data store (singleton). Every tab reads from the SAME
// cached snapshot instead of refetching on mount — so switching tabs is instant.
// Data stays fresh via ONE realtime channel (debounced) plus a visibility-gated
// background poll, rather than one subscription + poll per page.
import { createClient } from '@/lib/supabase/client';

const INITIAL = {
  loading: true,
  user: null,
  profile: null,
  settings: null,
  participants: [],
  golfers: [],
  picks: [],
};

let state = INITIAL;
const listeners = new Set();
let client = null;
let started = false;
let inflight = null;
let pollTimer = null;
let debounceTimer = null;

const POLL_MS = 15000; // background fallback — realtime carries the immediacy

function getClient() {
  if (!client) client = createClient();
  return client;
}
function emit() {
  for (const l of listeners) l();
}

export function getPoolSnapshot() {
  return state;
}
export function getPoolServerSnapshot() {
  return INITIAL;
}
export function getPoolClient() {
  return getClient();
}

// Re-read the whole pool. Concurrent calls share one in-flight request (dedup).
export async function refreshPool() {
  if (inflight) return inflight;
  const supabase = getClient();
  inflight = (async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [profileRes, settingsRes, partRes, golferRes, pickRes] = await Promise.all([
        user
          ? supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('draft_state').select('*').eq('id', 1).maybeSingle(),
        supabase.from('participants').select('*').order('draft_position'),
        supabase.from('golfers').select('*').order('rank', { nullsFirst: false }),
        supabase.from('picks').select('*').order('pick_number'),
      ]);
      state = {
        loading: false,
        user,
        profile: profileRes.data,
        settings: settingsRes.data,
        participants: partRes.data || [],
        golfers: golferRes.data || [],
        picks: pickRes.data || [],
      };
      emit();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Coalesce bursts of realtime events (e.g. many picks landing) into one refresh.
function scheduleRefresh() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refreshPool, 250);
}

function onVisible() {
  if (document.visibilityState === 'visible') refreshPool();
}

// Start the single channel + poll once, then keep them alive for the whole
// session so navigating between tabs never tears down / re-establishes them.
function start() {
  const supabase = getClient();
  refreshPool();
  supabase
    .channel('pool-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_state' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'golfers' }, scheduleRefresh)
    .subscribe();
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshPool();
  }, POLL_MS);
  supabase.auth.onAuthStateChange(() => refreshPool());
  document.addEventListener('visibilitychange', onVisible);
}

export function subscribePool(cb) {
  listeners.add(cb);
  if (!started) {
    started = true;
    start();
  }
  return () => listeners.delete(cb);
}
