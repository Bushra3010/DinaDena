'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Clock, IndianRupee, MapPin, Users } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { MapView } from '@/components/Map';
import { Alert, Avatar, Button, Card, Empty, KeyValue, PageLoader, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, duration, rupees } from '@/lib/format';
import { useCategories, useLoad } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc } from '@/lib/supabase';
import type { NearbyJob } from '@/lib/types';
import { useMyWorker } from '@/lib/worker';

export default function WorkerJobDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { t, lang, catName } = useI18n();
  const router = useRouter();
  const categories = useCategories();
  const { data: me } = useMyWorker(profile?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: job, loading } = useLoad(async () => {
    const all = await rpc<NearbyJob[]>('nearby_open_jobs', { p_radius_km: 100 });
    return all.find((j) => j.id === id) ?? null;
  }, [id]);

  if (loading) return <PageLoader />;
  if (!job) return <><TopBar title="" back="/w/jobs" /><Empty title={t('no_nearby_jobs')} /></>;
  const cat = categories.find((c) => c.id === job.category_id);
  const home = me?.private?.home_lat != null ? { lat: me.private.home_lat, lng: me.private.home_lng! } : null;

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
      <TopBar title={job.title} back="/w/jobs" sub={job.code} />
      <MapView className="m-4 h-48" center={job} markers={[
        { id: 'job', lat: job.lat, lng: job.lng, kind: 'job' },
        ...(home ? [{ id: 'me', ...home, kind: 'me' as const }] : []),
      ]} />
      <div className="space-y-4 px-4">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <CategoryIcon icon={cat?.icon} boxed />
            <div className="flex-1">
              <p className="font-bold">{job.title}</p>
              <p className="text-sm text-muted">{catName(cat)}</p>
            </div>
          </div>
          {job.description && <p className="mt-3 text-sm">{job.description}</p>}
          {job.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.photo_url} alt="" className="mt-3 max-h-48 w-full rounded-xl object-cover" />
          )}
          <div className="mt-3 space-y-1.5 text-sm">
            <p className="flex items-center gap-2"><MapPin className="size-4 text-muted" />{job.area} · {t('km_away', { d: job.distance_km.toFixed(1) })}</p>
            <p className="flex items-center gap-2"><Clock className="size-4 text-muted" />{dateTime(job.start_at, lang)} · {duration(job.duration_minutes, lang)}</p>
            <p className="flex items-center gap-2"><Users className="size-4 text-muted" />{t('slots_filled', { n: job.slots_filled, m: job.workers_needed })}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <Avatar name={job.customer_name} size={44} />
          <div><p className="text-xs text-muted">{t('customer')}</p><p className="font-semibold">{job.customer_name}</p></div>
        </Card>
        <Card className="p-4">
          <KeyValue strong k={<span className="flex items-center gap-1.5"><IndianRupee className="size-4" />{t('per_worker')}</span>} v={rupees(job.rate_per_worker)} />
        </Card>
        {error && <Alert tone="red">{error}</Alert>}
      </div>
      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button size="lg" full loading={busy} disabled={!me?.profile.verified} onClick={accept}>{busy ? t('accepting') : t('accept_job')}</Button>
      </div>
    </div>
  );
}
