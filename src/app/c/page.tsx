'use client';

import Link from 'next/link';
import { Bell, ChevronRight, MapPin, Search, Users, Zap } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Logo } from '@/components/Logo';
import { Card, SectionTitle, Select, StatusPill } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, rupees } from '@/lib/format';
import { AREAS } from '@/lib/geo';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useMyPlace } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useUnreadCount } from '@/components/MobileShell';

export default function CustomerHome() {
  const { profile } = useAuth();
  const { t, lang, catName, status } = useI18n();
  const categories = useCategories();
  const { place, setPlace } = useMyPlace();
  const router = useRouter();
  const unread = useUnreadCount(profile?.id);
  const [q, setQ] = useState('');

  const { data: recent, reload } = useLoad(async () => {
    const { data } = await supabase.from('jobs').select('*').eq('customer_id', profile!.id)
      .order('created_at', { ascending: false }).limit(6);
    return (data ?? []) as Job[];
  }, [profile?.id]);
  useRealtime('jobs', `customer_id=eq.${profile!.id}`, reload);

  const active = recent?.find((j) => ['open', 'booked', 'in_progress'].includes(j.status));
  const firstName = profile?.full_name?.split(' ')[0] ?? '';

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim().toLowerCase();
    const match = categories.find((c) => c.name_en.toLowerCase().includes(term) || c.name_hi.includes(term) || c.slug.includes(term));
    router.push(match ? `/c/workers?category=${match.id}` : '/c/workers');
  };

  return (
    <div className="pb-6">
      <header className="bg-white px-4 pb-4 pt-4">
        <div className="flex items-center justify-between">
          <Logo />
          <Link href="/c/notifications" aria-label={t('notifications')} className="relative flex size-11 items-center justify-center rounded-full hover:bg-brand-50">
            <Bell className="size-5.5" />
            {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-brand-500 ring-2 ring-white" />}
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-brand-500" />
          <Select aria-label={t('area')} className="min-h-9 border-0 bg-transparent py-1 pl-0 font-semibold focus:ring-0"
            value={AREAS.some((a) => a.name === place.area) ? place.area : ''}
            onChange={(e) => {
              const a = AREAS.find((x) => x.name === e.target.value);
              if (a) setPlace({ area: a.name, lat: a.lat, lng: a.lng });
            }}>
            {!AREAS.some((a) => a.name === place.area) && <option value="">{place.area}</option>}
            {AREAS.map((a) => <option key={a.name} value={a.name}>{a.name}, Jaipur</option>)}
          </Select>
        </div>
        <div className="customer-greeting mt-3"><p className="text-[28px] font-bold tracking-tight">{t('hello', { name: firstName })}</p><p className="mt-1 text-sm text-muted">{lang === 'hi' ? 'स्थानीय काम। अपने लोग। बेहतर दिन।' : 'Local help. Real people. Better days.'}</p></div>
        <form onSubmit={onSearch} className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-brand-50/50 px-3">
          <Search className="size-4.5 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_placeholder')} aria-label={t('search')}
            className="min-h-11 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400" />
        </form>
      </header>

      <div className="space-y-5 px-4 pt-4">
        {active && (
          <Link href={`/c/jobs/${active.id}`}>
            <Card className="flex items-center gap-3 border-brand-200 bg-brand-50 p-3.5">
              <span className="relative flex size-3"><span className="radar-ring absolute inline-flex size-full rounded-full bg-brand-400" /><span className="relative inline-flex size-3 rounded-full bg-brand-500" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{active.title}</p>
                <p className="text-xs text-muted">{active.code} · {status(active.status)}</p>
              </div>
              <ChevronRight className="size-5 text-brand-500" />
            </Card>
          </Link>
        )}

        <Link href="/c/post" className="ocean-panel relative block overflow-hidden rounded-3xl p-5 text-white shadow-lg shadow-brand-500/25">
          <div className="absolute -right-6 -top-8 size-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-10 right-10 size-24 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white/20"><Zap className="size-7 fill-white" /></div>
            <div className="flex-1">
              <h2 className="text-xl font-extrabold">{t('quick_jobs')}</h2>
              <p className="text-sm text-white/90">{t('quick_jobs_sub')}</p>
              <p className="mt-1 text-xs font-medium text-white/75">{t('quick_jobs_tag')}</p>
            </div>
            <ChevronRight className="size-6" />
          </div>
        </Link>

        <Link href="/c/workers">
          <Card className="flex items-center gap-4 p-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-50"><Users className="size-6 text-ink" /></div>
            <div className="flex-1">
              <h2 className="font-bold">{t('daily_workers')}</h2>
              <p className="text-sm text-muted">{t('daily_workers_sub')}</p>
            </div>
            <ChevronRight className="size-5 text-muted" />
          </Card>
        </Link>

        <section>
          <SectionTitle>{t('popular_categories')}</SectionTitle>
          <div className="grid grid-cols-4 gap-2.5">
            {categories.map((c) => (
              <Link key={c.id} href={`/c/workers?category=${c.id}`} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-2 pb-2.5 text-center ring-1 ring-line hover:ring-brand-300">
                <CategoryIcon icon={c.icon} boxed />
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{catName(c)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle action={<Link href="/c/bookings" className="text-sm font-semibold text-brand-600">{t('view_all')}</Link>}>
            {t('recent_bookings')}
          </SectionTitle>
          {!recent?.length ? (
            <Card className="p-5 text-center text-sm text-muted">{t('no_bookings')}</Card>
          ) : (
            <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
              {recent.map((j) => {
                const cat = categories.find((c) => c.id === j.category_id);
                return (
                  <Link key={j.id} href={`/c/jobs/${j.id}`} className="w-56 shrink-0 snap-start">
                    <Card className="h-full p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <CategoryIcon icon={cat?.icon} boxed className="size-10" />
                        <StatusPill status={j.status} />
                      </div>
                      <p className="mt-2 truncate text-sm font-bold">{j.title}</p>
                      <p className="truncate text-xs text-muted">{catName(cat)} · {dateTime(j.start_at, lang)}</p>
                      <p className="mt-1 text-sm font-semibold">{rupees((j.rate_per_worker + j.platform_fee) * j.workers_needed)}</p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
