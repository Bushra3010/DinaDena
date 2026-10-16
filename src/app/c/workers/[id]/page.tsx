'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BadgeCheck, Briefcase, MapPin, Star } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Avatar, Badge, Card, Empty, LinkButton, PageLoader, SectionTitle, Stars, TopBar } from '@/components/ui';
import { km, rupees, timeAgo } from '@/lib/format';
import { useCategories, useLoad } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useMyPlace } from '@/lib/location';
import { rpc, supabase } from '@/lib/supabase';
import type { Quote, Review, WorkerCard } from '@/lib/types';

export default function WorkerProfilePage() {
  return <Suspense><WorkerProfile /></Suspense>;
}

function WorkerProfile() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { t, lang, catName } = useI18n();
  const categories = useCategories();
  const { place } = useMyPlace();

  const { data, loading } = useLoad(async () => {
    const [cards, { data: reviews }] = await Promise.all([
      rpc<WorkerCard[]>('get_worker_card', { p_worker: id, p_lat: place.lat, p_lng: place.lng }),
      supabase.from('reviews').select('*').eq('to_user', id).order('created_at', { ascending: false }).limit(20),
    ]);
    const rs = (reviews ?? []) as Review[];
    const { data: names } = rs.length
      ? await supabase.from('public_profiles').select('id, full_name').in('id', rs.map((r) => r.from_user))
      : { data: [] };
    return { worker: cards[0] ?? null, reviews: rs, names: Object.fromEntries((names ?? []).map((n) => [n.id, n.full_name])) };
  }, [id, place.lat, place.lng]);

  // Daily rate for the chosen trade, priced by the server (admin rate or worker override).
  const quoteCat = params.get('category') ?? data?.worker?.category_ids[0];
  const { data: quote } = useLoad(async () => quoteCat
    ? rpc<Quote>('price_quote', { p_category: quoteCat, p_minutes: 480, p_workers: 1, p_worker: id })
    : null, [quoteCat, id]);

  if (loading && !data) return <PageLoader />;
  const w = data?.worker;
  if (!w) return <><TopBar title="" back /><Empty title={t('something_wrong')} /></>;

  const skills = categories.filter((c) => w.category_ids.includes(c.id));
  const bookCat = params.get('category') && w.category_ids.includes(params.get('category')!) ? params.get('category')! : w.category_ids[0];
  const bookCatRow = categories.find((c) => c.id === bookCat);
  const rate = quote?.rate_per_worker ?? w.daily_rate;

  return (
    <div className="pb-28">
      <TopBar title={w.full_name ?? ''} back />
      <div className="bg-white px-4 pb-5 pt-2 text-center">
        <Avatar name={w.full_name} url={w.avatar_url} size={88} className="mx-auto" />
        <h1 className="mt-3 text-xl font-extrabold">{w.full_name}</h1>
        <div className="mt-1 flex items-center justify-center gap-2">
          <Badge tone="green"><BadgeCheck className="size-3.5" />{t('verified')}</Badge>
          <Badge tone={w.available ? 'green' : 'gray'}>{w.available ? t('available_now') : t('busy')}</Badge>
        </div>
        <p className="mt-2 flex items-center justify-center gap-1 text-sm text-muted"><MapPin className="size-4" />{w.home_area} · {km(w.distance_km)}</p>
        <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line">
          <div className="py-3"><p className="flex items-center justify-center gap-1 text-lg font-bold"><Star className="size-4 fill-amber-400 text-amber-400" />{Number(w.rating_avg).toFixed(1)}</p><p className="text-xs text-muted">{w.rating_count} {t('reviews')}</p></div>
          <div className="py-3"><p className="text-lg font-bold">{w.jobs_completed}</p><p className="text-xs text-muted">{t('jobs_done')}</p></div>
          <div className="py-3"><p className="text-lg font-bold">{w.experience_years}</p><p className="text-xs text-muted">{t('experience')}</p></div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <Card className="p-4">
          <SectionTitle>{t('skills')}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {skills.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
                <CategoryIcon icon={c.icon} className="size-4" />{catName(c)}
              </span>
            ))}
          </div>
          {w.bio && <><SectionTitle>{t('about')}</SectionTitle><p className="text-sm text-muted">{w.bio}</p></>}
        </Card>

        <Card className="p-4">
          <SectionTitle>{t('reviews')}</SectionTitle>
          {!data.reviews.length ? <p className="text-sm text-muted">{t('no_reviews')}</p> : (
            <ul className="divide-y divide-line">
              {data.reviews.map((r) => (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{data.names[r.from_user] ?? '—'}</span>
                    <Stars value={r.rating} />
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-muted">{r.comment}</p>}
                  <p className="mt-0.5 text-xs text-stone-400">{timeAgo(r.created_at, lang)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[440px] -translate-x-1/2 items-center gap-3 border-t border-line bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="flex-1">
          <p className="text-xl font-black">{rupees(rate)}</p>
          <p className="flex items-center gap-1 text-xs text-muted"><Briefcase className="size-3" />{catName(bookCatRow)} · {t('per_day')}</p>
        </div>
        <LinkButton href={`/c/workers/${id}/book?category=${bookCat}`} size="lg" className="px-8">{t('book_now')}</LinkButton>
      </div>
    </div>
  );
}
