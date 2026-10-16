'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { readStoredLang, storeLang } from './i18n';
import type { Profile, Role } from './types';

type AuthValue = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<Profile | null>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return null;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    const p = (data as Profile | null) ?? null;
    setProfile(p);
    if (p?.onboarded && p.language !== readStoredLang()) storeLang(p.language);
    return p;
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => loadProfile(s?.user.id), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value: AuthValue = {
    ready,
    session,
    profile,
    refreshProfile: () => loadProfile(session?.user.id),
    updateProfile: async (patch) => {
      if (!session) return;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', session.user.id)
        .select('*').single();
      if (error) throw new Error(error.message);
      setProfile(data as Profile);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

export function homeFor(role: Role) {
  return role === 'admin' ? '/admin' : role === 'worker' ? '/w' : '/c';
}

/** Sends the visitor where they belong if they are not signed in as `role`. */
export function useRequireRole(role: Role) {
  const { ready, session, profile } = useAuth();
  const router = useRouter();
  const allowed = ready && !!session && !!profile && profile.onboarded && profile.role === role;

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace('/login');
    else if (profile && !profile.onboarded) router.replace('/onboarding');
    else if (profile && profile.role !== role) router.replace(homeFor(profile.role));
  }, [ready, session, profile, role, router]);

  return { allowed, profile: allowed ? profile : null };
}
