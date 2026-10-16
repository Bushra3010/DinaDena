'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, IndianRupee, List, Map as MapIcon, MapPin, SearchX, Users } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { MapView } from '@/components/Map';
import { Alert, Card, Chip, Empty, LinkButton, PageLoader, Segmented, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { duration, rupees } from '@/lib/format';
import { CITY } from '@/lib/geo';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc } from '@/lib/supabase';
import type { NearbyJob } from '@/lib/types';
import { useMyWorker } from '@/lib/worker';

const RADII = [5, 10, 20];

export default function NearbyJobs() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const categories = useCategories();
  const { data: me } = useMyWorker(profile?.id);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [radius, setRadius] = useState(10);

  const { data, loading, reload } = useLoad(() => rpc<NearbyJob[]>('nearby_open_jobs', { p_radius_km: radius }), [radius]);
  useRealtime('jobs', 'status=eq.open', reload);

  const home = me?.private?.home_lat != null ? { lat: me.private.home_lat, lng: me.private.home_lng! } : CITY;

  return (
    <div className="pb-6">
      <TopBar title={t('nearby_jobs')} />
      <div className="space-y-3 bg-white px-4 pb-3 pt-1">
        <Segmented value={view} onChange={setView} options={[
          { value: 'list', label: <><List className="size-4" />{t('list_view')}</> },
          { value: 'map', label: <><MapIcon className="size-4" />{t('map_view')}</> },
        ]} />
        <div className="flex gap-2">
          {RADII.map((r) => <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>{t('within_km', { n: r })}</Chip>)}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {me && !me.profile.verified && <Alert tone="amber" title={t('under_verification')}>{t('under_verification_sub')}</Alert>}
        {me?.profile.verified && !me.profile.available && <Alert tone="blue">{t('go_online_hint')}</Alert>}

        {loading && !data ? <PageLoader /> : view === 'map' ? (
          <MapView className="h-[60vh]" center={home} zoom={12} onMarkerClick={(id) => id !== 'me' && router.push(`/w/jobs/${id}`)}
            markers={[
              { id: 'me', ...home, kind: 'me', tooltip: 'You' },
              ...(data ?? []).map((j) => ({ id: j.id, lat: j.lat, lng: j.lng, kind: 'job' as const, tooltip: `${j.title} · ${rupees(j.rate_per_worker)}` })),
            ]} />
        ) : !data?.length ? (
          <Empty icon={<SearchX className="size-6" />} title={t('no_nearby_jobs')} />
        ) : data.map((j) => {
          const cat = categories.find((c) => c.id === j.category_id);
          return (
            <Card key={j.id} className="p-4">
              <div className="flex gap-3">
                <CategoryIcon icon={cat?.icon} boxed className="size-14" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{j.title}</p>
                  <p className="flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5" />{t('km_away', { d: j.distance_km.toFixed(1) })}</p>
                  <p className="truncate text-sm text-muted">{j.area}, Jaipur</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <span className="flex items-center gap-1.5"><Users className="size-4 text-muted" /><span><b>{j.workers_needed - j.slots_filled}</b> {t('workers')}</span></span>
                <span className="flex items-center gap-1.5"><Clock className="size-4 text-muted" /><b>{duration(j.duration_minutes, lang)}</b></span>
                <span className="flex items-center gap-1.5"><IndianRupee className="size-4 text-muted" /><span><b>{rupees(j.rate_per_worker)}</b> {t('per_worker')}</span></span>
              </div>
              <LinkButton href={`/w/jobs/${j.id}`} full className="mt-3">{t('view_details')}</LinkButton>
            </Card>
          );
        })}
        <Link href="/w/bookings" className="block text-center text-sm font-semibold text-brand-600">{t('my_work')} →</Link>
      </div>
    </div>
  );
}
