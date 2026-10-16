'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Button, Card, Empty, PageLoader, Segmented, StatusPill, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, rupees } from '@/lib/format';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Booking, BookingStatus, Job } from '@/lib/types';

type Tab = 'active' | 'completed' | 'closed';
const TAB_STATUS: Record<Tab, BookingStatus[]> = {
  active: ['requested', 'accepted', 'on_the_way', 'in_progress'], completed: ['completed'], closed: ['rejected', 'expired', 'cancelled'],
};
const PAGE = 20;

export default function WorkerBookings() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const categories = useCategories();
  const [tab, setTab] = useState<Tab>('active');
  const [pages, setPages] = useState(1);

  const { data, loading, reload } = useLoad(async () => {
    const { data: bookings } = await supabase.from('bookings').select('*').eq('worker_id', profile!.id)
      .in('status', TAB_STATUS[tab]).order('created_at', { ascending: false }).range(0, pages * PAGE);
    const bs = (bookings ?? []) as Booking[];
    const { data: jobs } = bs.length ? await supabase.from('jobs').select('*').in('id', bs.map((b) => b.job_id)) : { data: [] };
    return { bookings: bs.slice(0, pages * PAGE), more: bs.length > pages * PAGE, jobs: (jobs ?? []) as Job[] };
  }, [tab, pages, profile?.id]);
  useRealtime('bookings', `worker_id=eq.${profile!.id}`, reload);

  return (
    <div className="pb-6">
      <TopBar title={t('my_work')} back="/w" />
      <div className="px-4 py-3">
        <Segmented value={tab} onChange={(v) => { setTab(v); setPages(1); }} options={[
          { value: 'active', label: t('tab_active') }, { value: 'completed', label: t('tab_completed') }, { value: 'closed', label: t('tab_cancelled') },
        ]} />
      </div>
      <div className="space-y-2 px-4">
        {loading && !data ? <PageLoader /> : !data?.bookings.length ? <Empty icon={<ClipboardList className="size-6" />} title={t('no_bookings')} /> :
          data.bookings.map((b) => {
            const j = data.jobs.find((x) => x.id === b.job_id);
            const cat = categories.find((c) => c.id === j?.category_id);
            return (
              <Link key={b.id} href={`/w/bookings/${b.id}`} className="block">
                <Card className="flex items-center gap-3 p-3.5">
                  <CategoryIcon icon={cat?.icon} boxed className="size-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{j?.title}</p>
                    <p className="truncate text-xs text-muted">{j?.area} · {j && dateTime(j.start_at, lang)}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-sm font-bold">{rupees(b.amount)}</p>
                    <StatusPill status={b.status} />
                  </div>
                </Card>
              </Link>
            );
          })}
        {data?.more && <Button variant="outline" full onClick={() => setPages((p) => p + 1)}>{t('load_more')}</Button>}
      </div>
    </div>
  );
}
