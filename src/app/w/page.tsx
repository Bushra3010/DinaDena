'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Bell, ChevronRight, CircleX, ClipboardCheck, Clock, MapPin, Star } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { WorkerJobCard } from '@/components/worker/WorkerJobCard';
import { useUnreadCount } from '@/components/MobileShell';
import { Alert, Button, Card, Modal, PageLoader, SectionTitle, StatusPill, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, rupees } from '@/lib/format';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc, supabase, usingMock } from '@/lib/supabase';
import type { Booking, Job, LedgerEntry, NearbyJob } from '@/lib/types';
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

  const { data: nearby, reload: reloadNearby } = useLoad(() => rpc<NearbyJob[]>('nearby_open_jobs', { p_radius_km: 5 }), [profile?.id]);
  useRealtime('jobs', 'status=eq.open', reloadNearby);

  if (!me) return <PageLoader />;
  const wp = me.profile;
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
        <Link href="/w" className="worker-wordmark">DiNaDeNa</Link>
        <span className="ml-auto mr-4 flex items-center gap-1.5 text-sm"><MapPin className="size-5 text-brand-500" />Jaipur</span>
        <Link href="/w/notifications" aria-label={t('notifications')} className="relative flex size-11 items-center justify-center rounded-full hover:bg-brand-50">
          <Bell className="size-5.5" />
          {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-brand-500 ring-2 ring-white" />}
        </Link>
      </header>

      <div className="space-y-4 p-4">
        <section className="worker-greeting" style={{ padding: '12px 16px' }}>
          <p className="text-sm">{lang === 'hi' ? 'नमस्ते,' : 'Good ' + (new Date().getHours() < 12 ? 'morning,' : new Date().getHours() < 17 ? 'afternoon,' : 'evening,')}</p>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-tight">{profile?.full_name?.split(' ')[0]}</h1>
          <p className="mt-1 text-[13px] leading-snug text-muted">{lang === 'hi' ? 'स्थानीय काम। अपने लोग। बेहतर दिन।' : 'Find local work. Real people. Better days.'}</p>
        </section>

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

        <Card className="flex items-center gap-3 p-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100"><span className={wp.available ? "size-3 rounded-full bg-emerald-500" : "size-3 rounded-full bg-slate-400"} /></span>
          <div className="flex-1">
            <p className="font-bold">{t('available_for_work')}</p>
            <p className="text-xs text-muted">{wp.verified ? t('available_sub') : t('available_locked')}</p>
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

        <Link href="/w/earnings" className="worker-earnings block">
          <div><p className="text-sm">{t('this_week')}</p><p className="mt-1 text-4xl font-bold tracking-tight">{rupees(weekTotal)}</p></div>
          <div className="worker-bars" aria-hidden>{[14, 24, 19, 34, 39, 54, 31].map((h, i) => <span key={i} style={{ height: h }} />)}</div>
          <ChevronRight className="absolute right-4 top-4 size-7 rounded-full bg-white/15 p-1" />
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/w/bookings"><Card className="flex items-center gap-2.5 p-3"><ClipboardCheck className="size-9 shrink-0 rounded-full bg-brand-50 p-1.5 text-brand-500" /><div><p className="text-2xl font-bold">{wp.jobs_completed}</p><p className="text-[11px] text-muted">{t('jobs_done')}</p></div><ChevronRight className="ml-auto size-4 text-muted" /></Card></Link>
          <Link href="/w/profile"><Card className="flex items-center gap-2.5 p-3"><Star className="size-9 shrink-0 rounded-full bg-brand-50 p-1.5 text-brand-500" /><div><p className="text-2xl font-bold">{Number(wp.rating_avg).toFixed(1)}</p><p className="text-[11px] text-muted">{t('rating')}</p></div><ChevronRight className="ml-auto size-4 text-muted" /></Card></Link>
        </div>
        <section>
          <SectionTitle action={<Link href="/w/jobs" className="text-sm font-medium text-brand-500">{t('view_all')}</Link>}>{t('nearby_jobs')}</SectionTitle>
          <div className="space-y-3">{nearby?.slice(0, 2).map((job) => <WorkerJobCard key={job.id} job={job} compact />)}</div>
          {nearby?.length === 0 && <p className="py-4 text-sm text-muted">{t('no_nearby_jobs')}</p>}
          <Link href="/w/jobs" className="worker-primary mt-3 flex min-h-13 items-center justify-center gap-3">{lang === 'hi' ? 'काम खोजें' : 'Explore jobs'}<ArrowRight className="size-5" /></Link>
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

      </div>
    </div>
  );
}
