'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, CircleCheck, Clock, HardHat, IndianRupee, Shield, ShieldCheck, UserRound } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cx } from '@/components/ui';
import { useI18n, type TKey } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

const LANGS: { value: Lang; label: string; native: string }[] = [
  { value: 'en', label: 'English', native: 'Hello' },
  { value: 'hi', label: 'हिन्दी', native: 'नमस्ते' },
];

const ROLES: { value: string; icon: typeof UserRound; title: TKey; sub: TKey }[] = [
  { value: 'customer', icon: UserRound, title: 'role_tab_customer', sub: 'role_customer_sub' },
  { value: 'worker', icon: HardHat, title: 'role_tab_worker', sub: 'role_worker_sub' },
  { value: 'admin', icon: Shield, title: 'role_tab_admin', sub: 'role_admin_sub' },
];

export default function Welcome() {
  const { lang, setLang, t } = useI18n();
  const router = useRouter();

  const perks = [
    { icon: ShieldCheck, text: t('verified') },
    { icon: Clock, text: t('attendance_otp') },
    { icon: IndianRupee, text: 'UPI' },
  ];

  return (
    <div className="auth-frame mx-auto flex min-h-dvh max-w-[440px] flex-col bg-white px-5 pb-8 pt-10">
      <Logo sub={t('app_tagline')} />
      <div className="mt-10">
        <div className="relative overflow-hidden rounded-3xl ocean-panel p-6 text-white">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-12 right-6 size-28 rounded-full bg-white/10" />
          <h1 className="relative text-[26px] font-extrabold leading-tight">{t('welcome_title')}</h1>
          <p className="relative mt-2 text-white/85">{t('welcome_sub')}</p>
          <div className="relative mt-5 flex flex-wrap gap-2">
            {perks.map((p) => (
              <span key={p.text} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <p.icon className="size-3.5" /> {p.text}
              </span>
            ))}
          </div>
        </div>

        <h2 className="mb-3 mt-8 font-bold">{t('choose_language')}</h2>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('choose_language')}>
          {LANGS.map((l) => (
            <button key={l.value} type="button" role="radio" aria-checked={lang === l.value} onClick={() => setLang(l.value)}
              className={cx('relative rounded-2xl border-2 p-4 text-left transition-colors',
                lang === l.value ? 'border-brand-500 bg-brand-50' : 'border-line bg-white')}>
              {lang === l.value && <CircleCheck className="absolute right-3 top-3 size-5 text-brand-500" />}
              <div className="text-lg font-bold">{l.label}</div>
              <div className="text-sm text-muted">{l.native}</div>
            </button>
          ))}
        </div>
      </div>
      <h2 className="mb-3 mt-8 font-bold">{t('continue_as')}</h2>
      <div className="space-y-2.5">
        {ROLES.map((r) => (
          <button key={r.value} type="button" onClick={() => { setLang(lang); router.push(`/login?as=${r.value}`); }}
            className="flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-line bg-white px-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><r.icon className="size-5" /></span>
            <span className="flex-1">
              <span className="block font-bold">{t(r.title)}</span>
              <span className="block text-xs text-muted">{t(r.sub)}</span>
            </span>
            <ChevronRight className="size-5 text-muted" />
          </button>
        ))}
      </div>
    </div>
  );
}
