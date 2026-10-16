'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { PageHeader, Table, Td } from '@/components/admin/AdminShell';
import { Badge, Button, Chip, Input, PageLoader, statusTone } from '@/components/ui';
import { dateTime, rupees } from '@/lib/format';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Booking, Job, JobStatus } from '@/lib/types';

const FILTERS: { label: string; value: JobStatus[] | null }[] = [
  { label: 'All', value: null }, { label: 'Open', value: ['open'] }, { label: 'Booked', value: ['booked'] },
  { label: 'In progress', value: ['in_progress'] }, { label: 'Completed', value: ['completed'] }, { label: 'Cancelled', value: ['cancelled'] },
];
const PAGE = 20;

export default function LiveRequests() {
  const categories = useCategories();
  const [filter, setFilter] = useState(0);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const { data, loading, reload } = useLoad(async () => {
    let query = supabase.from('jobs').select('*', { count: 'exact' }).order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    const f = FILTERS[filter]!.value;
    if (f) query = query.in('status', f);
    if (q.trim()) query = query.or(`code.ilike.%${q.trim()}%,title.ilike.%${q.trim()}%,area.ilike.%${q.trim()}%`);
    const { data: jobs, count } = await query;
    const js = (jobs ?? []) as Job[];
    const ids = js.map((j) => j.id);
    const [{ data: bookings }, { data: names }] = await Promise.all([
      ids.length ? supabase.from('bookings').select('job_id, status, amount, platform_fee').in('job_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('profiles').select('id, full_name, phone').in('id', js.map((j) => j.customer_id)) : Promise.resolve({ data: [] }),
    ]);
    return { jobs: js, count: count ?? 0, bookings: (bookings ?? []) as Pick<Booking, 'job_id' | 'status' | 'amount' | 'platform_fee'>[], names: names ?? [] };
  }, [filter, q, page]);
  useRealtime('jobs', null, reload);
  useRealtime('bookings', null, reload);

  return (
    <>
      <PageHeader n="02" title="Live Requests" sub="Manage all quick and daily job requests in real time" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f, i) => <Chip key={f.label} active={filter === i} onClick={() => { setFilter(i); setPage(0); }}>{f.label}</Chip>)}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-3.5 size-4 text-muted" />
          <Input aria-label="Search jobs" className="pl-9" placeholder="Search code, title, area" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
      </div>
      {loading && !data ? <PageLoader /> : (
        <Table empty={!data?.jobs.length} head={['Job ID', 'Customer', 'Location', 'Job type', 'Workers', 'Amount', 'Created', 'Status', '']}>
          {data?.jobs.map((j) => {
            const c = data.names.find((n) => n.id === j.customer_id);
            const bs = data.bookings.filter((b) => b.job_id === j.id && ['accepted', 'on_the_way', 'in_progress', 'completed'].includes(b.status));
            return (
              <tr key={j.id} className="hover:bg-stone-50">
                <Td className="font-mono text-xs font-semibold">{j.code}</Td>
                <Td><p className="font-medium">{c?.full_name}</p><p className="text-xs text-muted">{c?.phone}</p></Td>
                <Td>{j.area}</Td>
                <Td><p>{j.title}</p><p className="text-xs text-muted">{categories.find((x) => x.id === j.category_id)?.name_en} · {j.job_type}</p></Td>
                <Td className="tabular-nums">{bs.length}/{j.workers_needed}</Td>
                <Td className="tabular-nums">{rupees((j.rate_per_worker + j.platform_fee) * j.workers_needed)}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">{dateTime(j.created_at)}</Td>
                <Td><Badge tone={statusTone[j.status]}>{j.status.replace('_', ' ')}</Badge></Td>
                <Td><Link href={`/admin/jobs/${j.id}`} className="font-semibold text-brand-600">View</Link></Td>
              </tr>
            );
          })}
        </Table>
      )}
      {data && data.count > PAGE && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted">
          <span>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, data.count)} of {data.count}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= data.count} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </>
  );
}
