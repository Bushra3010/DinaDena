'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { List, Map as MapIcon, MapPin, Search, SearchX } from 'lucide-react';
import { WorkerJobCard } from '@/components/worker/WorkerJobCard';
import { MapView } from '@/components/Map';
import { Alert, Chip, Empty, Input, PageLoader, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { rupees } from '@/lib/format';
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
  const [radius, setRadius] = useState(5);

  const { data, loading, reload } = useLoad(() => rpc<NearbyJob[]>('nearby_open_jobs', { p_radius_km: radius }), [radius]);
  useRealtime('jobs', 'status=eq.open', reload);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const filtered = (data ?? []).filter((j) => (category === 'all' || j.category_id === category) && `${j.title} ${j.area} ${j.description ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  const home = me?.private?.home_lat != null ? { lat: me.private.home_lat, lng: me.private.home_lng! } : CITY;

  return (
    <div className="pb-6">
      <header className="flex items-center justify-between"><h1 className="text-[28px] font-bold tracking-tight">{t('nearby_jobs')}</h1><span className="flex items-center gap-1.5 text-sm"><MapPin className="size-5 text-brand-500" />Jaipur</span></header>
      <div className="space-y-3 bg-white px-4 pb-3 pt-1">
        <label className="relative block"><Search className="absolute left-3.5 top-3 size-5" /><Input className="pl-11" aria-label={lang === 'hi' ? 'काम खोजें' : 'Search jobs'} placeholder={lang === 'hi' ? 'आसपास काम खोजें...' : 'Search for jobs near you...'} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <Segmented value={view} onChange={setView} options={[
          { value: 'list', label: <><List className="size-4" />{t('list_view')}</> },
          { value: 'map', label: <><MapIcon className="size-4" />{t('map_view')}</> },
        ]} />
        <div className="worker-filters flex gap-2">
          {RADII.map((r) => <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>{t('within_km', { n: r })}</Chip>)}
        </div>
        <div className="worker-filters no-scrollbar flex gap-2 overflow-x-auto pb-1"><Chip active={category === 'all'} onClick={() => setCategory('all')}>{lang === 'hi' ? 'सभी' : 'All'}</Chip>{categories.filter((c) => data?.some((j) => j.category_id === c.id)).map((c) => <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>{lang === 'hi' ? c.name_hi : c.name_en}</Chip>)}</div>
      </div>

      <div className="space-y-3 p-4">
        {me && !me.profile.verified && <Alert tone="amber" title={t('under_verification')}>{t('under_verification_sub')}</Alert>}
        {me?.profile.verified && !me.profile.available && <Alert tone="blue">{t('go_online_hint')}</Alert>}

        {loading && !data ? <PageLoader /> : view === 'map' ? (
          <MapView className="h-[60vh]" center={home} zoom={12} onMarkerClick={(id) => id !== 'me' && router.push(`/w/jobs/${id}`)}
            markers={[
              { id: 'me', ...home, kind: 'me', tooltip: 'You' },
              ...filtered.map((j) => ({ id: j.id, lat: j.lat, lng: j.lng, kind: 'job' as const, tooltip: `${j.title} · ${rupees(j.rate_per_worker)}` })),
            ]} />
        ) : !filtered.length ? (
          <Empty icon={<SearchX className="size-6" />} title={t('no_nearby_jobs')} />
        ) : <><p className="font-bold">{filtered.length} {lang === 'hi' ? 'काम आपके पास' : 'jobs near you'}</p>{filtered.map((j) => <WorkerJobCard key={j.id} job={j} />)}</>}
        <Link href="/w/bookings" className="block text-center text-sm font-semibold text-brand-600">{t('my_work')} →</Link>
      </div>
    </div>
  );
}
