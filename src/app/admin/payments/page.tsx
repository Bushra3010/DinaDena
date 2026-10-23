'use client';

import Link from 'next/link';
import { useState } from 'react';
import { IndianRupee, Percent, RotateCcw, Wallet } from 'lucide-react';
import { PageHeader, StatCard, Table, Td } from '@/components/admin/AdminShell';
import { Alert, Badge, Button, Chip, PageLoader, statusTone } from '@/components/ui';
import { dateTime, rupees } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { rpc, supabase } from '@/lib/supabase';
import type { Payment, PaymentStatus } from '@/lib/types';

const FILTERS: (PaymentStatus | null)[] = [null, 'success', 'failed', 'refunded'];

export default function Payments() {
  const [filter, setFilter] = useState<PaymentStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, reload } = useLoad(async () => {
    let q = supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(100);
    if (filter) q = q.eq('status', filter);
    const [{ data: pays }, { data: all }, { data: ledger }, { data: fees }] = await Promise.all([
      q,
      supabase.from('payments').select('amount, status'),
      supabase.from('wallet_ledger').select('amount'),
      supabase.from('bookings').select('platform_fee').not('paid_at', 'is', null),
    ]);
    const ps = (pays ?? []) as Payment[];
    const [{ data: jobs }, { data: bookings }] = await Promise.all([
      ps.length ? supabase.from('jobs').select('id, code').in('id', ps.map((p) => p.job_id)) : Promise.resolve({ data: [] }),
      ps.length ? supabase.from('bookings').select('id, worker_id').in('id', ps.map((p) => p.booking_id)) : Promise.resolve({ data: [] }),
    ]);
    const ids = [...ps.map((p) => p.customer_id), ...(bookings ?? []).map((b) => b.worker_id)];
    const { data: people } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
    return {
      payments: ps, jobs: jobs ?? [], bookings: bookings ?? [], people: people ?? [],
      collected: (all ?? []).filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0),
      refunded: (all ?? []).filter((p) => p.status === 'refunded').reduce((s, p) => s + p.amount, 0),
      payouts: (ledger ?? []).reduce((s, l) => s + l.amount, 0),
      fees: (fees ?? []).reduce((s, b) => s + b.platform_fee, 0),
    };
  }, [filter]);

  // A job payment is stored as one row per worker booking, so each row names its worker.
  const workerName = (bookingId: string) => {
    const b = data?.bookings.find((x) => x.id === bookingId);
    return data?.people.find((x) => x.id === b?.worker_id)?.full_name;
  };

  const refund = async (bookingId: string) => {
    setBusy(bookingId);
    setError(null);
    try {
      await rpc('admin_refund_booking', { p_booking: bookingId });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader n="05" title="Payments & Payouts" sub="UPI collections (demo gateway), worker payouts and refunds" />
      {loading && !data ? <PageLoader /> : data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Collected" value={rupees(data.collected)} icon={<IndianRupee className="size-6" />} tone="green" />
            <StatCard label="Worker payouts (ledger)" value={rupees(data.payouts)} icon={<Wallet className="size-6" />} tone="blue" />
            <StatCard label="Platform fees" value={rupees(data.fees)} icon={<Percent className="size-6" />} />
            <StatCard label="Refunded" value={rupees(data.refunded)} icon={<RotateCcw className="size-6" />} tone="amber" />
          </div>
          <div className="mb-3 flex gap-2">
            {FILTERS.map((f) => <Chip key={f ?? 'all'} active={filter === f} onClick={() => setFilter(f)}>{f ?? 'All'}</Chip>)}
          </div>
          {error && <Alert tone="red" className="mb-3">{error}</Alert>}
          <Table empty={!data.payments.length} head={['Payment ref', 'Job', 'Customer', 'Worker', 'Method', 'Amount', 'Date', 'Status', '']}>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <Td className="font-mono text-xs">{p.gateway_payment_id ?? p.gateway_order_id}</Td>
                <Td><Link href={`/admin/jobs/${p.job_id}`} className="font-mono text-xs font-semibold text-brand-600">{data.jobs.find((j) => j.id === p.job_id)?.code}</Link></Td>
                <Td>{data.people.find((x) => x.id === p.customer_id)?.full_name}</Td>
                <Td>{workerName(p.booking_id)}</Td>
                <Td className="uppercase">{p.method} · {p.gateway}</Td>
                <Td className="tabular-nums">{rupees(p.amount)}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">{dateTime(p.created_at)}</Td>
                <Td><Badge tone={statusTone[p.status]}>{p.status}</Badge></Td>
                <Td>{p.status === 'success' && <Button size="sm" variant="outline" loading={busy === p.booking_id} onClick={() => refund(p.booking_id)}>Refund</Button>}</Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}
