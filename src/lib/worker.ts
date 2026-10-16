'use client';

import { useLoad } from './hooks';
import { supabase } from './supabase';
import type { WorkerPrivate, WorkerProfile } from './types';

/** The signed-in worker's own public + private profile rows (null until registered). */
export function useMyWorker(userId: string | undefined, refreshKey?: string) {
  return useLoad(async () => {
    if (!userId) return null;
    const [{ data: wp }, { data: pr }] = await Promise.all([
      supabase.from('worker_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('worker_private').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    if (!wp) return null;
    return { profile: wp as WorkerProfile, private: (pr as WorkerPrivate | null) };
  }, [userId, refreshKey]);
}
