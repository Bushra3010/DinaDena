'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Clock, MapPin, Users, Zap, ClipboardList, ChevronRight } from 'lucide-react';
import { Alert, Avatar, Button, Card, Empty, PageLoader, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, duration, rupees } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc } from '@/lib/supabase';
import type { NearbyJob } from '@/lib/types';
import { useMyWorker } from '@/lib/worker';

export default function WorkerJobDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const { data: me } = useMyWorker(profile?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: job, loading } = useLoad(async () => {
    const all = await rpc<NearbyJob[]>('nearby_open_jobs', { p_radius_km: 100 });
    return all.find((j) => j.id === id) ?? null;
  }, [id]);

  if (loading) return <PageLoader />;
  if (!job) return <><TopBar title="" back="/w/jobs" /><Empty title={t('no_nearby_jobs')} /></>;


  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const bookingId = await rpc<string>('accept_job', { p_job: id });
      router.replace(`/w/bookings/${bookingId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="pb-28">
      <TopBar title="" back="/w/jobs" sub={job.code} />
      <div className="worker-detail">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-2 text-xs font-semibold"><Zap className="size-4 fill-brand-500 text-brand-500" />{lang === 'hi' ? 'जल्दी काम' : 'QUICK JOB'}</span>
        <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-tight">{job.title}</h1>
        <p className="mb-5 mt-2 flex items-center gap-3"><span className="text-5xl font-bold tracking-tight text-brand-500">{rupees(job.rate_per_worker)}</span><span className="text-muted">{t('per_worker')}</span></p>
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3"><MapPin className="mb-2 size-6 text-brand-500" /><p className="font-bold">{job.distance_km.toFixed(1)} km</p><p className="mt-1 text-xs text-muted">{lang === 'hi' ? 'आपसे दूरी' : 'from you'}</p></Card>
          <Card className="p-3"><Clock className="mb-2 size-6 text-brand-500" /><p className="font-bold">{duration(job.duration_minutes, lang)}</p><p className="mt-1 text-xs text-muted">{t('estimated_time')}</p></Card>
          <Card className="p-3"><Users className="mb-2 size-6 text-brand-500" /><p className="font-bold">{job.workers_needed - job.slots_filled} {lang === 'hi' ? 'जगह' : job.workers_needed - job.slots_filled === 1 ? 'spot' : 'spots'}</p><p className="mt-1 text-xs text-muted">{lang === 'hi' ? 'उपलब्ध' : 'available'}</p></Card>
        </div>
        <section className="worker-detail-section"><h2 className="mb-3 text-sm font-semibold">{t('customer')}</h2><div className="flex items-center gap-3"><Avatar name={job.customer_name} size={56} className="worker-avatar" /><p className="font-bold">{job.customer_name}</p></div></section>
        <section className="worker-detail-section"><h2 className="mb-2 text-lg font-bold">{lang === 'hi' ? 'इस काम के बारे में' : 'About this job'}</h2><p className="leading-relaxed text-muted">{job.description}</p><p className="mt-4 flex items-center gap-3 text-sm text-muted"><ClipboardList className="size-5 shrink-0 text-ink" />{dateTime(job.start_at, lang)}</p><p className="mt-3 flex items-center gap-3 text-sm text-muted"><Users className="size-5 text-ink" />{lang === 'hi' ? 'एक छोटी टीम के साथ काम करें' : 'Work with a small team'}</p>
          {/* Job photos are user-provided URLs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {job.photo_url && <img src={job.photo_url} alt={job.title} className="mt-4 max-h-48 w-full rounded-xl object-cover" />}
        </section>
        <section className="worker-detail-section flex items-center gap-3"><MapPin className="size-12 shrink-0 rounded-full border border-line p-2.5 text-brand-500" /><div><p className="text-sm text-muted">{lang === 'hi' ? 'स्थान' : 'Location'}</p><p className="font-bold">{job.area}, Jaipur</p><p className="mt-1 text-xs text-muted">{job.address}</p></div><ChevronRight className="ml-auto size-5 shrink-0 text-muted" /></section>
        {error && <Alert tone="red">{error}</Alert>}
      </div>
      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button size="lg" full loading={busy} disabled={!me?.profile.verified} onClick={accept}>{busy ? t('accepting') : t('accept_job')}<ArrowRight className="size-5" /></Button>
      </div>
    </div>
  );
}
