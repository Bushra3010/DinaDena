'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HardHat, Shield, UserRound } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Alert, Button, Field, Input, OtpBoxes, Segmented } from '@/components/ui';
import { homeFor, useAuth } from '@/lib/auth';
import { DEMO_ACCOUNTS, DEMO_MODE, DEMO_OTP } from '@/lib/demo';
import { formatPhone, timeOnly } from '@/lib/format';
import { useTick } from '@/lib/hooks';
import { useI18n, type TKey } from '@/lib/i18n';
import { resetMockDb } from '@/lib/mock/store';
import { supabase, usingMock } from '@/lib/supabase';

const MAX_TRIES = 3;
const LOCK_MS = 15 * 60_000;
const RESEND_S = 30;

// Wrong-OTP lock per number. Supabase also rate-limits verification server-side.
type Lock = { tries: number; until: number };
const lockKey = (phone: string) => `dinadena.otp.${phone}`;
function readLock(phone: string): Lock {
  try {
    return JSON.parse(localStorage.getItem(lockKey(phone)) || '') as Lock;
  } catch {
    return { tries: 0, until: 0 };
  }
}
function writeLock(phone: string, l: Lock) {
  try {
    localStorage.setItem(lockKey(phone), JSON.stringify(l));
  } catch {}
}

export type LoginRole = 'customer' | 'worker' | 'admin';
const ROLES: LoginRole[] = ['customer', 'worker', 'admin'];
const ROLE_ICON = { customer: UserRound, worker: HardHat, admin: Shield };

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}

function Login() {
  const { t, lang } = useI18n();
  const { ready, session, profile, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const asParam = params.get('as');
  const [role, setRole] = useState<LoginRole>(ROLES.includes(asParam as LoginRole) ? (asParam as LoginRole) : 'customer');
  // True while verify() checks the role, so the redirect effect waits for it.
  const checking = useRef(false);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const now = useTick(1000, step === 'otp');

  useEffect(() => {
    if (!ready || !session || !profile || checking.current) return;
    router.replace(profile.onboarded ? homeFor(profile.role) : `/onboarding?as=${role}`);
  }, [ready, session, profile, router, role]);

  const e164 = `+91${phone}`;

  async function sendOtp(target = phone) {
    setError(null);
    if (!/^[6-9]\d{9}$/.test(target)) return setError(t('invalid_phone'));
    const lock = readLock(target);
    if (lock.until > Date.now()) return setError(t('otp_locked', { time: timeOnly(new Date(lock.until).toISOString(), lang) }));
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${target}` });
    setBusy(false);
    if (error) return setError(error.message);
    setStep('otp');
    setSentAt(Date.now());
  }

  async function verify(code = otp) {
    setError(null);
    const lock = readLock(phone);
    if (lock.until > Date.now()) return setError(t('otp_locked', { time: timeOnly(new Date(lock.until).toISOString(), lang) }));
    setBusy(true);
    checking.current = true;
    const { data, error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
    if (!error && data.user) {
      // Each app has its own login: a number registered for another role is refused here.
      const { data: p } = await supabase.from('profiles').select('role, onboarded').eq('id', data.user.id).maybeSingle();
      const mismatch = p?.onboarded ? p.role !== role : role === 'admin';
      setBusy(false);
      if (mismatch) {
        await signOut();
        checking.current = false;
        setStep('phone');
        setOtp('');
        setError(p?.onboarded ? t('wrong_role', { role: t(`role_tab_${p.role}` as TKey) }) : t('not_admin'));
        return;
      }
      checking.current = false;
      writeLock(phone, { tries: 0, until: 0 });
      router.replace(p?.onboarded ? homeFor(p.role) : `/onboarding?as=${role}`);
      return;
    }
    checking.current = false;
    setBusy(false);
    if (error) {
      const tries = lock.tries + 1;
      if (tries >= MAX_TRIES) {
        writeLock(phone, { tries: 0, until: Date.now() + LOCK_MS });
        setError(t('otp_locked', { time: timeOnly(new Date(Date.now() + LOCK_MS).toISOString(), lang) }));
      } else {
        writeLock(phone, { tries, until: 0 });
        setError(t('wrong_otp', { n: MAX_TRIES - tries }));
      }
      setOtp('');
      return;
    }
  }

  const resendLeft = Math.max(0, RESEND_S - Math.floor((now - sentAt) / 1000));

  return (
    <div className="auth-frame mx-auto min-h-dvh max-w-[440px] bg-white">
      <div className="px-5 pb-10 pt-8">
        <Logo sub={t('app_tagline')} />
        {usingMock && (
          <Alert tone="blue" className="mt-6" title={t('demo_mode_title')}>
            {t('demo_mode_sub')}{' '}
            <button type="button" className="font-semibold underline" onClick={() => { resetMockDb(); setError(null); }}>{t('reset_demo')}</button>
          </Alert>
        )}

        {step === 'phone' ? (
          <form className="mt-10 space-y-5" onSubmit={(e) => { e.preventDefault(); sendOtp(); }}>
            <Segmented value={role} onChange={(r) => { setRole(r); setError(null); router.replace(`/login?as=${r}`); }}
              options={ROLES.map((r) => {
                const Icon = ROLE_ICON[r];
                return { value: r, label: <><Icon className="size-4" />{t(`role_tab_${r}` as TKey)}</> };
              })} />
            <div>
              <h1 className="text-2xl font-extrabold">{t(`login_title_${role}` as TKey)}</h1>
              <p className="mt-1 text-muted">{t('login_sub')}</p>
            </div>
            <Field label={t('mobile_number')} htmlFor="phone" error={error}>
              <div className="flex gap-2">
                <span className="flex min-h-11 items-center rounded-xl border border-line bg-brand-50/50 px-3 font-semibold">+91</span>
                <Input id="phone" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" maxLength={10}
                  value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} autoFocus />
              </div>
            </Field>
            <Button type="submit" size="lg" full loading={busy}>{busy ? t('sending') : t('send_otp')}</Button>
          </form>
        ) : (
          <form className="mt-10 space-y-5" onSubmit={(e) => { e.preventDefault(); verify(); }}>
            <div>
              <h1 className="text-2xl font-extrabold">{t('enter_otp')}</h1>
              <p className="mt-1 text-muted">{t('otp_sent_to', { phone: formatPhone(phone) })}
                {' · '}<button type="button" className="font-semibold text-brand-600" onClick={() => { setStep('phone'); setOtp(''); setError(null); }}>{t('change_number')}</button>
              </p>
            </div>
            <OtpBoxes length={6} value={otp} onChange={(v) => { setOtp(v); if (v.length === 6) verify(v); }} autoFocus invalid={!!error} />
            {error && <p className="text-center text-sm font-medium text-red-600" role="alert">{error}</p>}
            <Button type="submit" size="lg" full loading={busy} disabled={otp.length !== 6}>{busy ? t('verifying') : t('verify')}</Button>
            <div className="text-center text-sm text-muted">
              {resendLeft > 0 ? t('resend_in', { s: resendLeft }) : (
                <button type="button" className="font-semibold text-brand-600" onClick={() => sendOtp()}>{t('resend_otp')}</button>
              )}
              <p className="mt-1 text-xs">{t('otp_expires')}</p>
            </div>
          </form>
        )}

        {DEMO_MODE && step === 'phone' && (
          <section className="mt-10 rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 p-4">
            <h2 className="font-bold">{t('demo_logins')} · {t(`role_tab_${role}` as TKey)}</h2>
            <p className="text-xs text-muted">{t('demo_hint', { otp: DEMO_OTP })}</p>
            <ul className="mt-3 space-y-2">
              {DEMO_ACCOUNTS.filter((a) => a.role === role).map((a) => {
                const Icon = ROLE_ICON[a.role];
                return (
                  <li key={a.phone}>
                    <button type="button" disabled={busy}
                      onClick={async () => { setPhone(a.phone); await sendOtp(a.phone); setOtp(DEMO_OTP); }}
                      className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-line hover:ring-brand-300">
                      <Icon className="size-5 text-brand-500" />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">{a.name}</span>
                        {'note' in a && <span className="block text-xs text-muted">{a.note}</span>}
                      </span>
                      <span className="text-xs tabular-nums text-muted">{formatPhone(a.phone)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
