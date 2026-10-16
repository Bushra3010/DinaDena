'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/Logo';
import { homeFor, useAuth } from '@/lib/auth';
import { readStoredLang } from '@/lib/i18n';

// Splash: routes to welcome (first launch), login, onboarding or the role's home.
export default function Splash() {
  const { ready, session, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!readStoredLang()) router.replace('/welcome');
    else if (!session) router.replace('/login');
    else if (!profile?.onboarded) router.replace('/onboarding');
    else router.replace(homeFor(profile.role));
  }, [ready, session, profile, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white">
      <LogoMark className="size-16 animate-pulse" />
    </div>
  );
}
