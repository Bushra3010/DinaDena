'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Badge, Button, Card, Empty, PageLoader, SectionTitle, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateOnly, rupees } from '@/lib/format';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Booking, Job, LedgerEntry } from '@/lib/types';

const PAGE = 20;

export default function Earnings() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const categories = useCategories();
  const [pages, setPages] = useState(1);

  const { data, loading, reload } = useLoad(async () => {
    const [{ data: all }, { data: rows }] = await Promise.all([
      supabase.from('wallet_ledger').select('amount, created_at').eq('user_id', profile!.id),
      supabase.from('wallet_ledger').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false }).range(0, pages * PAGE),
    ]);
    const ledger = (rows ?? []) as LedgerEntry[];
    const bookingIds = ledger.map((l) => l.booking_id).filter(Boolean) as string[];
    const { data: bookings } = bookingIds.length ? await supabase.from('bookings').select('id, job_id').in('id', bookingIds) : { data: [] };
    const bs = (bookings ?? []) as Pick<Booking, 'id' | 'job_id'>[];
    const { data: jobs } = bs.length ? await supabase.from('jobs').select('id, title, area, category_id').in('id', bs.map((b) => b.job_id)) : { data: [] };
    const weekAgo = Date.now() - 7 * 86400_000;
    const totals = (all ?? []) as Pick<LedgerEntry, 'amount' | 'created_at'>[];
    return {
      ledger: ledger.slice(0, pages * PAGE), more: ledger.length > pages * PAGE,
      balance: totals.reduce((s, l) => s + l.amount, 0),
      week: totals.filter((l) => new Date(l.created_at).getTime() > weekAgo).reduce((s, l) => s + l.amount, 0),
      jobFor: (bookingId: string | null) => {
        const b = bs.find((x) => x.id === bookingId);
        return (jobs ?? []).find((j) => j.id === b?.job_id) as Pick<Job, 'id' | 'title' | 'area' | 'category_id'> | undefined;
      },
    };
  }, [profile?.id, pages]);
  useRealtime('notifications', `user_id=eq.${profile!.id}`, reload);

  return (
    <div className="pb-6">
      <TopBar title={t('nav_earnings')} />
      <div className="space-y-4 p-4">
        <Card className="overflow-hidden">
          <div className="ocean-panel p-5 text-white">
            <p className="flex items-center gap-2 text-sm text-white/85"><Wallet className="size-4" />{t('total_earnings')}</p>
            <p className="mt-1 text-3xl font-black">{rupees(data?.balance ?? 0)}</p>
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-muted">{t('this_week')}</span>
            <span className="font-bold">{rupees(data?.week ?? 0)}</span>
          </div>
        </Card>

        <section>
          <SectionTitle>{t('recent_transactions')}</SectionTitle>
          {loading && !data ? <PageLoader /> : !data?.ledger.length ? <Empty icon={<Wallet className="size-6" />} title={t('no_bookings')} /> : (
            <Card className="divide-y divide-line">
              {data.ledger.map((l) => {
                const job = data.jobFor(l.booking_id);
                const cat = categories.find((c) => c.id === job?.category_id);
                const row = (
                  <div className="flex items-center gap-3 p-3.5">
                    <CategoryIcon icon={cat?.icon} boxed className="size-11" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{job?.title ?? l.reason}</p>
                      <p className="truncate text-xs text-muted">{job?.area} · {dateOnly(l.created_at, lang)}</p>
                    </div>
                    <div className="text-right">
                      <p className={l.amount < 0 ? 'font-bold text-red-600' : 'font-bold'}>{rupees(l.amount)}</p>
                      <Badge tone={l.amount < 0 ? 'red' : 'green'}>{l.amount < 0 ? 'Reversed' : t('paid')}</Badge>
                    </div>
                  </div>
                );
                return l.booking_id ? <Link key={l.id} href={`/w/bookings/${l.booking_id}`} className="block">{row}</Link> : <div key={l.id}>{row}</div>;
              })}
            </Card>
          )}
          {data?.more && <Button variant="outline" full className="mt-3" onClick={() => setPages((p) => p + 1)}>{t('load_more')}</Button>}
        </section>
      </div>
    </div>
  );
}
