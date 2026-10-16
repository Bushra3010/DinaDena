import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mockClient } from './mock/client';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);
/** No Supabase keys: run on the in-browser mock backend with seeded demo data. */
export const usingMock = !supabaseConfigured;

// One client for the whole app. With keys it is the real Supabase client (sessions persist in
// localStorage, which also works inside the Capacitor Android shell); without, the mock.
export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : (mockClient as unknown as SupabaseClient);

/** Throws the Supabase error message so callers can show it. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function publicUrl(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function uploadFile(bucket: string, userId: string, file: File) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return path;
}
