'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BadgeCheck, Bell, ChevronRight, CircleX, Clock, Star, Wallet } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Logo } from '@/components/Logo';
import { useUnreadCount } from '@/components/MobileShell';
import { Alert, Avatar, Button, Card, Modal, PageLoader, SectionTitle, StatusPill, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, rupees } from '@/lib/format';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc, supabase, usingMock } from '@/lib/supabase';
import type { Booking, Job, LedgerEntry } from '@/lib/types';
import { useMyWorker } from '@/lib/worker';

export default function WorkerHome() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const categories = useCategories();
  const unread = useUnreadCount(profile?.id);
  const { data: me, reload: reloadMe, setData: setMe } = useMyWorker(profile?.id);
  const [toggling, setToggling] = useState(false);
  const [approving, setApproving] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);

  const { data, reload } = useLoad(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [{ data: ledger }, { data: bookings }] = await Promise.all([
      supabase.from('wallet_ledger').select('*').eq('user_id', profile!.id).gte('created_at', weekAgo),
      supabase.from('bookings').select('*').eq('worker_id', profile!.id)
        .in('status', ['requested', 'accepted', 'on_the_way', 'in_progress']).order('created_at', { ascending: false }),
    ]);
    const bs = (bookings ?? []) as Booking[];
    const { data: jobs } = bs.length ? await supabase.from('jobs').select('*').in('id', bs.map((b) => b.job_id)) : { data: [] };
    const { count: weekJobs } = await supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('worker_id', profile!.id).eq('status', 'completed').gte('check_out_at', weekAgo);
    return { ledger: (ledger ?? []) as LedgerEntry[], bookings: bs, jobs: (jobs ?? []) as Job[], weekJobs: weekJobs ?? 0 };
  }, [profile?.id]);
  useRealtime('bookings', `worker_id=eq.${profile!.id}`, reload);
  useRealtime('notifications', `user_id=eq.${profile!.id}`, reloadMe);

  if (!me) return <PageLoader />;
  const wp = me.profile;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = data?.ledger.filter((l) => new Date(l.created_at) >= startOfDay) ?? [];
  const todayTotal = today.reduce((s, l) => s + l.amount, 0);
  const weekTotal = data?.ledger.reduce((s, l) => s + l.amount, 0) ?? 0;

  async function setAvailable(v: boolean) {
    // Unverified workers cannot go online; explain instead of silently ignoring the tap.
    if (!wp.verified) return setLockedOpen(true);
    setToggling(true);
    const { data: row } = await supabase.from('worker_profiles').update({ available: v }).eq('user_id', profile!.id).select('*').single();
    if (row) setMe((m) => (m ? { ...m, profile: { ...m.profile, ...row } } : m));
    setToggling(false);
  }

  return (
    <div className="pb-6">
      <header className="flex items-center justify-between bg-white px-4 py-3">
        <Logo />
        <Link href="/w/notifications" aria-label={t('notifications')} className="relative flex size-11 items-center justify-center rounded-full hover:bg-stone-100">
          <Bell className="size-5.5" />
          {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-brand-500 ring-2 ring-white" />}
        </Link>
      </header>

      <div className="space-y-4 p-4">
        <Link href="/w/profile">
          <Card className="flex items-center gap-3 p-4">
            <Avatar name={profile?.full_name} url={profile?.avatar_url} size={60} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold">{profile?.full_name}</p>
              {wp.verified ? (
                <p className="flex items-center gap-1 text-sm font-semibold text-emerald-700"><BadgeCheck className="size-4" />{t('verified_worker')}</p>
              ) : <StatusBadge status={wp.status} />}
              <p className="flex items-center gap-1 text-sm text-muted"><Star className="size-3.5 fill-amber-400 text-amber-400" />{Number(wp.rating_avg).toFixed(1)} ({t('jobs_completed_n', { n: wp.jobs_completed })})</p>
            </div>
            <ChevronRight className="size-5 text-muted" />
          </Card>
        </Link>

        {wp.status === 'pending' && (
          <Alert tone="amber" icon={<Clock className="size-5" />} title={t('under_verification')}>
            {t('under_verification_sub')}
            {usingMock && (
              <div className="mt-2 space-y-2">
                <p className="text-xs">{t('demo_approve_hint')}</p>
                <Button size="sm" variant="dark" loading={approving} onClick={async () => {
                  setApproving(true);
                  await rpc('demo_self_approve').catch(() => undefined);
                  await reloadMe();
                  setApproving(false);
                }}>{t('demo_approve_now')}</Button>
              </div>
            )}
          </Alert>
        )}
        {wp.status === 'rejected' && <Alert tone="red" icon={<CircleX className="size-5" />} title={t('profile_rejected')}>{wp.rejection_reason}</Alert>}
        {wp.status === 'suspended' && <Alert tone="red" icon={<CircleX className="size-5" />} title={t('profile_suspended')}>{wp.rejection_reason}</Alert>}

        <Card className="flex items-center gap-3 p-4">
          <div className="flex-1">
            <p className="font-bold">{t('available_for_work')}</p>
            <p className="text-sm text-muted">{wp.verified ? t('available_sub') : t('available_locked')}</p>
          </div>
          <Toggle checked={wp.available} disabled={toggling} onChange={setAvailable} label={t('available_for_work')} />
        </Card>

        {!!data?.bookings.length && (
          <section>
            <SectionTitle>{t('my_work')}</SectionTitle>
            <div className="space-y-2">
              {data.bookings.map((b) => {
                const j = data.jobs.find((x) => x.id === b.job_id);
                const cat = categories.find((c) => c.id === j?.category_id);
                return (
                  <Link key={b.id} href={`/w/bookings/${b.id}`}>
                    <Card className="flex items-center gap-3 border-brand-200 p-3.5">
                      <CategoryIcon icon={cat?.icon} boxed className="size-11" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{j?.title}</p>
                        <p className="truncate text-xs text-muted">{j?.area} · {j && dateTime(j.start_at, lang)}</p>
                      </div>
                      <StatusPill status={b.status} />
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <Link href="/w/earnings">
          <Card className="flex items-center gap-4 border-brand-200 bg-brand-50 p-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white text-brand-600"><Wallet className="size-6" /></div>
            <div className="flex-1">
              <p className="text-sm text-muted">{t('todays_earnings')}</p>
              <p className="text-2xl font-black">{rupees(todayTotal)}</p>
            </div>
            <span className="text-xs text-muted">{t('jobs_completed_n', { n: today.length })}</span>
            <ChevronRight className="size-5 text-muted" />
          </Card>
        </Link>

        <section>
          <SectionTitle>{t('quick_stats')} <span className="font-normal text-muted">({t('this_week')})</span></SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3 text-center"><p className="text-xl font-black">{data?.weekJobs ?? 0}</p><p className="text-xs text-muted">{t('jobs_done')}</p></Card>
            <Card className="p-3 text-center"><p className="text-xl font-black">{rupees(weekTotal)}</p><p className="text-xs text-muted">{t('total_earnings')}</p></Card>
            <Card className="p-3 text-center"><p className="flex items-center justify-center gap-1 text-xl font-black"><Star className="size-4 fill-amber-400 text-amber-400" />{Number(wp.rating_avg).toFixed(1)}</p><p className="text-xs text-muted">{t('rating')}</p></Card>
          </div>
        </section>

        <Modal open={lockedOpen} onClose={() => setLockedOpen(false)} title={t('under_verification')}>
          <p className="text-sm text-muted">{t('available_locked')}. {t('under_verification_sub')}</p>
          {usingMock && wp.status === 'pending' ? (
            <Button full className="mt-4" loading={approving} onClick={async () => {
              setApproving(true);
              await rpc('demo_self_approve').catch(() => undefined);
              await reloadMe();
              setApproving(false);
              setLockedOpen(false);
            }}>{t('demo_approve_now')}</Button>
          ) : (
            <Button full variant="outline" className="mt-4" onClick={() => setLockedOpen(false)}>{t('close')}</Button>
          )}
        </Modal>

        <section>
          <SectionTitle>{t('skills')}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {categories.filter((c) => wp.category_ids.includes(c.id)).map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-line">
                <CategoryIcon icon={c.icon} className="size-4 text-brand-500" />{lang === 'hi' ? c.name_hi : c.name_en}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const label = status === 'pending' ? t('under_verification') : status === 'rejected' ? t('profile_rejected') : t('profile_suspended');
  return <p className="text-sm font-semibold text-amber-700">{label}</p>;
}
