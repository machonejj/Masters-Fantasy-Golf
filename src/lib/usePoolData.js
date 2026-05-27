'use client';

import { useSyncExternalStore } from 'react';
import {
  subscribePool,
  getPoolSnapshot,
  getPoolServerSnapshot,
  refreshPool,
  getPoolClient,
} from '@/lib/poolStore';

// Reads the shared pool store (settings, participants, golfers, picks + the
// current user/profile). The store fetches once and keeps itself fresh via one
// realtime channel + a visibility-gated poll, so this is instant on tab switches
// (no per-page refetch). `refresh()` triggers a deduped re-read. The optional
// arg is accepted for backwards-compatibility and ignored (polling is shared).
export function usePoolData(_opts) {
  const state = useSyncExternalStore(subscribePool, getPoolSnapshot, getPoolServerSnapshot);
  return { ...state, refresh: refreshPool, supabase: getPoolClient() };
}
