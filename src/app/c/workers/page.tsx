'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPin, SlidersHorizontal, UserSearch, Zap } from 'lucide-react';
import { Avatar, Badge, Card, Chip, Empty, LinkButton, PageLoader, Select, Stars, Toggle, TopBar } from '@/components/ui';
import { km, rupees } from '@/lib/format';
import { useCategories, useLoad, useSettings } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useMyPlace } from '@/lib/location';
import { rpc } from '@/lib/supabase';
import type { WorkerCard } from '@/lib/types';

const RATINGS = [0, 4, 4.5];
const RATES = [0, 800, 1000];

export default function WorkersPage() {
  return <Suspense><WorkerSearch /></Suspense>;
}

function WorkerSearch() {
  const { t, catName } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const categories = useCategories();
  const settings = useSettings();
  const { place } = useMyPlace();
  const categoryId = params.get('category') ?? categories[0]?.id ?? '';
  const [minRating, setMinRating] = useState(0);
  const [maxRate, setMaxRate] = useState(0);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const radius = settings?.search_radius_km ?? 10;

  // Filters re-query in place; only the category lives in the URL.
  const { data, loading } = useLoad(async () => {
    if (!categoryId) return [];
    return rpc<WorkerCard[]>('search_workers', {
      p_category: categoryId, p_lat: place.lat, p_lng: place.lng, p_radius_km: radius,
      p_min_rating: minRating, p_max_rate: maxRate || null, p_available_only: availableOnly,
    });
  }, [categoryId, place.lat, place.lng, radius, minRating, maxRate, availableOnly]);

  const cat = categories.find((c) => c.id === categoryId);

  return (
    <div className="pb-6">
      <TopBar title={t('workers_near_you')} back="/c" sub={<span className="inline-flex items-center gap-1"><MapPin className="size-3" />{place.area}</span>}
        right={<button type="button" aria-label={t('filters')} aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}
          className="flex size-11 items-center justify-center rounded-full hover:bg-brand-50"><SlidersHorizontal className="size-5" /></button>} />

      <div className="no-scrollbar flex gap-2 overflow-x-auto bg-white px-4 py-3">
        {categories.map((c) => (
          <Chip key={c.id} active={c.id === categoryId} onClick={() => router.replace(`/c/workers?category=${c.id}`)}>{catName(c)}</Chip>
        ))}
      </div>

      {showFilters && (
        <div className="space-y-3 border-y border-line bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="w-28 text-sm font-semibold">{t('min_rating')}</span>
            {RATINGS.map((r) => <Chip key={r} active={minRating === r} onClick={() => setMinRating(r)}>{r ? `${r}+ ★` : t('any')}</Chip>)}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 text-sm font-semibold">{t('max_rate')}</span>
            <Select aria-label={t('max_rate')} value={maxRate} onChange={(e) => setMaxRate(Number(e.target.value))} className="min-h-9 py-1.5">
              {RATES.map((r) => <option key={r} value={r}>{r ? `≤ ${rupees(r)}` : t('any')}</option>)}
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{t('available_now')}</span>
            <Toggle checked={availableOnly} onChange={setAvailableOnly} label={t('available_now')} />
          </div>
        </div>
      )}

      <div className="space-y-3 px-4 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">{t('sorted_by_distance', { km: radius })}</p>
          <LinkButton href={`/c/post?category=${categoryId}`} size="sm" variant="soft" icon={<Zap className="size-4" />}>{t('quick_jobs')}</LinkButton>
        </div>
        {loading && !data ? <PageLoader /> : !data?.length ? (
          <Empty icon={<UserSearch className="size-6" />} title={t('no_workers')} />
        ) : data.map((w) => (
          <Link key={w.user_id} href={`/c/workers/${w.user_id}?category=${categoryId}`}>
            <Card className="mb-3 flex gap-3 p-3.5 hover:border-brand-300">
              <Avatar name={w.full_name} url={w.avatar_url} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-bold">{w.full_name}</p>
                  <p className="shrink-0 text-right font-bold leading-tight">{rupees(w.daily_rate)}<span className="block text-[11px] font-normal text-muted">{t('per_day')}</span></p>
                </div>
                <p className="truncate text-sm text-muted">{catName(cat)} · {t('years', { n: w.experience_years })}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Stars value={w.rating_avg} count={w.rating_count} />
                  <span className="text-xs text-muted">· {km(w.distance_km)}</span>
                  <Badge tone={w.available ? 'green' : 'gray'}>{w.available ? t('available_now') : t('busy')}</Badge>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
