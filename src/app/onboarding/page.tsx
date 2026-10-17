'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HardHat, Home } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Alert, Button, cx, Field, Input, PageLoader } from '@/components/ui';
import { homeFor, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function OnboardingPage() {
  return <Suspense><Onboarding /></Suspense>;
}

function Onboarding() {
  const { ready, session, profile, updateProfile } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  // The role was picked on the login screen; the chooser only shows if it is missing.
  const asParam = useSearchParams().get('as');
  const fixedRole = asParam === 'worker' || asParam === 'customer' ? asParam : null;
  const [name, setName] = useState('');
  const [role, setRole] = useState<'customer' | 'worker'>(fixedRole ?? 'customer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace('/login');
    else if (profile?.onboarded) router.replace(homeFor(profile.role));
  }, [ready, session, profile, router]);

  if (!ready || !profile || profile.onboarded) return <PageLoader />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t('required'));
    setBusy(true);
    try {
      await updateProfile({ full_name: name.trim(), role, language: lang, onboarded: true });
      router.replace(role === 'worker' ? '/w/register' : '/c');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const roles = [
    { value: 'customer' as const, icon: Home, title: t('role_customer'), sub: t('role_customer_sub') },
    { value: 'worker' as const, icon: HardHat, title: t('role_worker'), sub: t('role_worker_sub') },
  ];

  return (
    <div className="auth-frame mx-auto min-h-dvh max-w-[440px] bg-white px-5 pb-10 pt-8">
      <Logo />
      <form onSubmit={submit} className="mt-10 space-y-6">
        <h1 className="text-2xl font-extrabold">{t('setup_title')}</h1>
        <Field label={t('your_name')} htmlFor="name" error={error}>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
        </Field>
        {!fixedRole && <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('i_want_to')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((r) => (
              <button key={r.value} type="button" aria-pressed={role === r.value} onClick={() => setRole(r.value)}
                className={cx('rounded-2xl border-2 p-4 text-left', role === r.value ? 'border-brand-500 bg-brand-50' : 'border-line')}>
                <r.icon className={cx('mb-3 size-7', role === r.value ? 'text-brand-500' : 'text-muted')} />
                <div className="font-bold">{r.title}</div>
                <div className="text-xs text-muted">{r.sub}</div>
              </button>
            ))}
          </div>
        </fieldset>}
        {role === 'worker' && <Alert tone="blue">{t('under_verification_sub')}</Alert>}
        <Button type="submit" size="lg" full loading={busy}>{t('continue')}</Button>
      </form>
    </div>
  );
}
