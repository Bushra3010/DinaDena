'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Category, Settings } from './types';

/** Runs an async loader on mount and whenever deps change; `reload` re-runs it. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key?: string; data?: T; error: string | null }>({ error: null });
  const loaderRef = useRef(loader);
  useLayoutEffect(() => {
    loaderRef.current = loader;
  });
  const seq = useRef(0);

  const run = useCallback(async (forKey: string) => {
    const id = ++seq.current;
    try {
      const v = await loaderRef.current();
      if (id === seq.current) setState({ key: forKey, data: v, error: null });
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, key: forKey, error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    run(key);
  }, [key, run]);

  const reload = useCallback(() => run(key), [key, run]);
  const setData = useCallback((fn: (d: T | undefined) => T | undefined) => setState((s) => ({ ...s, data: fn(s.data) })), []);

  // Previous data stays visible while a new key loads.
  return { data: state.data, error: state.error, loading: state.key !== key, reload, setData };
}

/**
 * Calls `onChange` when rows matching `filter` (e.g. "job_id=eq.123") change.
 * RLS still applies: clients only receive rows they can read.
 */
export function useRealtime(table: string, filter: string | null, onChange: () => void, enabled = true) {
  const cb = useRef(onChange);
  useLayoutEffect(() => {
    cb.current = onChange;
  });
  useEffect(() => {
    if (!enabled) return;
    const name = `rt:${table}:${filter ?? 'all'}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => cb.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled]);
}

/** Re-renders every `ms` milliseconds (timers, countdowns). */
export function useTick(ms = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

let categoriesCache: Promise<Category[]> | null = null;
export function fetchCategories(force = false) {
  if (!categoriesCache || force) {
    categoriesCache = (async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort');
      if (error) {
        categoriesCache = null;
        throw new Error(error.message);
      }
      return data as Category[];
    })();
  }
  return categoriesCache;
}

export function useCategories() {
  const { data } = useLoad(() => fetchCategories(), []);
  return data ?? [];
}

export function useSettings() {
  const { data } = useLoad(async () => {
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    return (data as Settings | null) ?? { platform_fee_per_worker: 25, request_timeout_minutes: 10, search_radius_km: 10 };
  }, []);
  return data;
}

export function usePublicNames(ids: string[]) {
  const key = [...new Set(ids)].sort().join(',');
  const { data } = useLoad(async () => {
    if (!key) return {} as Record<string, { full_name: string | null; avatar_url: string | null }>;
    const { data } = await supabase.from('public_profiles').select('id, full_name, avatar_url').in('id', key.split(','));
    return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
  }, [key]);
  return data ?? {};
}
