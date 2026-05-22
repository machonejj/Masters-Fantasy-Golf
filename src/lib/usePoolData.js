'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Loads the whole pool (settings, participants, golfers, picks) and keeps it
// fresh via Supabase realtime, with a polling fallback. Returns the data plus
// the current user/profile and a manual refresh().
export function usePoolData({ pollMs = 8000 } = {}) {
  const supabase = useRef(createClient()).current;
  const [state, setState] = useState({
    loading: true,
    user: null,
    profile: null,
    settings: null,
    participants: [],
    golfers: [],
    picks: [],
  });

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [profileRes, settingsRes, partRes, golferRes, pickRes] =
      await Promise.all([
        user
          ? supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('draft_state').select('*').eq('id', 1).maybeSingle(),
        supabase.from('participants').select('*').order('draft_position'),
        supabase.from('golfers').select('*').order('rank', { nullsFirst: false }),
        supabase.from('picks').select('*').order('pick_number'),
      ]);

    setState({
      loading: false,
      user,
      profile: profileRes.data,
      settings: settingsRes.data,
      participants: partRes.data || [],
      golfers: golferRes.data || [],
      picks: pickRes.data || [],
    });
  }, [supabase]);

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel('pool-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_state' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golfers' }, refresh)
      .subscribe();

    const poll = setInterval(refresh, pollMs);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [refresh, supabase, pollMs]);

  return { ...state, refresh, supabase };
}
