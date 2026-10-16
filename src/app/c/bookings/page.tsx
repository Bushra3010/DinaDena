'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardList, Headset, MapPin, Receipt, RotateCcw, Star } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ComplaintButton } from '@/components/ComplaintButton';
import { Avatar, Button, Card, Empty, LinkButton, PageLoader, Segmented, StatusPill, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, rupees } from '@/lib/format';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Booking, Job, JobStatus } from '@/lib/types';

type Tab = 'upcoming' | 'active' | 'completed' | 'cancelled';
const TAB_STATUS: Record<Tab, JobStatus[]> = {
  upcoming: ['open', 'booked'], active: ['in_progress'], completed: ['completed'], cancelled: ['cancelled'],
};
const PAGE = 20;

export default function MyBookings() {
  const { profile } = useAuth();
  const { t, lang, catName } = useI18n();
  const categories = useCategories();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [pages, setPages] = useState(1);

  const { data, loading, reload } = useLoad(async () => {
    const { data: jobs } = await supabase.from('jobs').select('*').eq('customer_id', profile!.id)
      .in('status', TAB_STATUS[tab]).order('start_at', { ascending: tab === 'upcoming' })
      .range(0, pages * PAGE);
    const js = (jobs ?? []) as Job[];
    const { data: bookings } = js.length
      ? await supabase.from('bookings').select('*').in('job_id', js.map((j) => j.id))
      : { data: [] };
    const bs = (bookings ?? []) as Booking[];
    const { data: names } = bs.length
      ? await supabase.from('public_profiles').select('id, full_name, avatar_url').in('id', bs.map((b) => b.worker_id))
      : { data: [] };
    return {
      jobs: js.slice(0, pages * PAGE), more: js.length > pages * PAGE, bookings: bs,
      names: Object.fromEntries((names ?? []).map((n) => [n.id, n])) as Record<string, { full_name: string | null; avatar_url: string | null }>,
    };
  }, [tab, pages, profile?.id]);
  useRealtime('jobs', `customer_id=eq.${profile!.id}`, reload);

  return (
    <div className="pb-6">
      <TopBar title={t('my_jobs')} />
      <div className="sticky top-14 z-10 bg-canvas px-4 py-3">
        <Segmented value={tab} onChange={(v) => { setTab(v); setPages(1); }} options={[
          { value: 'upcoming', label: t('tab_upcoming') }, { value: 'active', label: t('tab_active') },
          { value: 'completed', label: t('tab_completed') }, { value: 'cancelled', label: t('tab_cancelled') },
        ]} />
      </div>
      <div className="space-y-3 px-4">
        {loading && !data ? <PageLoader /> : !data?.jobs.length ? (
          <Empty icon={<ClipboardList className="size-6" />} title={t('no_bookings')}>
            <LinkButton href="/c/post" className="mt-3">{t('post_request')}</LinkButton>
          </Empty>
        ) : data.jobs.map((j) => {
          const cat = categories.find((c) => c.id === j.category_id);
          const bs = data.bookings.filter((b) => b.job_id === j.id && !['rejected', 'expired', 'cancelled'].includes(b.status));
          const total = j.status === 'completed'
            ? bs.reduce((s, b) => s + b.amount + b.platform_fee, 0)
            : (j.rate_per_worker + j.platform_fee) * j.workers_needed;
          return (
            <Card key={j.id} className="p-4">
              <Link href={`/c/jobs/${j.id}`} className="block">
                <div className="flex items-start gap-3">
                  <CategoryIcon icon={cat?.icon} boxed className="size-11" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-bold">{j.title}</p>
                      <StatusPill status={j.status} />
                    </div>
                    <p className="text-xs text-muted">{j.code} · {catName(cat)} · {dateTime(j.start_at, lang)}</p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted"><MapPin className="size-3" />{j.area ?? j.address}</p>
                  </div>
                </div>
                {bs.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {bs.slice(0, 4).map((b) => <Avatar key={b.id} name={data.names[b.worker_id]?.full_name} size={28} className="ring-2 ring-white" />)}
                    </div>
                    <span className="truncate text-xs text-muted">{bs.map((b) => data.names[b.worker_id]?.full_name?.split(' ')[0]).join(', ')}</span>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-sm text-muted">{t('total_amount')}</span>
                  <span className="font-bold">{rupees(total)}</span>
                </div>
              </Link>
              {j.status === 'completed' && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <LinkButton href={`/c/jobs/${j.id}`} variant="outline" size="sm" icon={<Receipt className="size-4" />}>{t('view_invoice')}</LinkButton>
                  <LinkButton href={`/c/jobs/${j.id}`} variant="soft" size="sm" icon={<Star className="size-4" />}>{t('rate_workers')}</LinkButton>
                </div>
              )}
              {(j.status === 'completed' || j.status === 'cancelled') && (
                <div className="mt-2">
                  <LinkButton href={j.job_type === 'daily' && bs[0] ? `/c/workers/${bs[0].worker_id}/book?category=${j.category_id}` : `/c/post?rebook=${j.id}`}
                    variant="ghost" size="sm" full icon={<RotateCcw className="size-4" />}>{t('rebook')}</LinkButton>
                </div>
              )}
            </Card>
          );
        })}
        {data?.more && <Button variant="outline" full onClick={() => setPages((p) => p + 1)}>{t('load_more')}</Button>}

        <Card className="mt-4 flex items-center gap-3 p-4">
          <Headset className="size-8 text-brand-500" />
          <div className="flex-1">
            <p className="font-bold">{t('need_help')}</p>
            <p className="text-xs text-muted">{t('need_help_sub')}</p>
          </div>
        </Card>
        <ComplaintButton variant="danger" />
      </div>
    </div>
  );
}
