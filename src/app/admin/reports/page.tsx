'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/admin/AdminShell';
import { Alert, Button, Card, Field, Input, SectionTitle } from '@/components/ui';
import { downloadFile, toCsv } from '@/lib/format';
import { supabase } from '@/lib/supabase';

// Local calendar dates (IST), not UTC: early-morning exports must include today.
const localDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => localDate(new Date());
const daysAgo = (n: number) => localDate(new Date(Date.now() - n * 86400_000));

export default function Reports() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const range = () => ({ from: new Date(`${from}T00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() });

  async function exportBookings() {
    setBusy('bookings');
    const r = range();
    const { data: bookings } = await supabase.from('bookings').select('*').gte('created_at', r.from).lte('created_at', r.to).order('created_at');
    const bs = bookings ?? [];
    const [{ data: jobs }, { data: people }] = await Promise.all([
      bs.length ? supabase.from('jobs').select('id, code, title, area, job_type').in('id', bs.map((b) => b.job_id)) : Promise.resolve({ data: [] }),
      bs.length ? supabase.from('profiles').select('id, full_name, phone').in('id', [...bs.map((b) => b.worker_id), ...bs.map((b) => b.customer_id)]) : Promise.resolve({ data: [] }),
    ]);
    const name = (id: string) => people?.find((p) => p.id === id)?.full_name ?? '';
    const rows = bs.map((b) => {
      const j = jobs?.find((x) => x.id === b.job_id);
      return {
        booking_id: b.id, job_code: j?.code, job_title: j?.title, job_type: j?.job_type, area: j?.area,
        customer: name(b.customer_id), worker: name(b.worker_id), status: b.status, amount: b.amount, platform_fee: b.platform_fee,
        created_at: b.created_at, check_in_at: b.check_in_at, check_out_at: b.check_out_at, paid_at: b.paid_at,
      };
    });
    finish('bookings', rows);
  }

  async function exportPayments() {
    setBusy('payments');
    const r = range();
    const { data: pays } = await supabase.from('payments').select('*').gte('created_at', r.from).lte('created_at', r.to).order('created_at');
    const ps = pays ?? [];
    const { data: jobs } = ps.length ? await supabase.from('jobs').select('id, code').in('id', ps.map((p) => p.job_id)) : { data: [] };
    finish('payments', ps.map((p) => ({
      payment_id: p.id, job_code: jobs?.find((j) => j.id === p.job_id)?.code, booking_id: p.booking_id, gateway: p.gateway,
      order_id: p.gateway_order_id, payment_ref: p.gateway_payment_id, method: p.method, amount: p.amount, status: p.status, created_at: p.created_at,
    })));
  }

  function finish(kind: string, rows: Record<string, unknown>[]) {
    setBusy(null);
    if (!rows.length) return setMsg(`No ${kind} in this date range.`);
    downloadFile(`dinadena-${kind}-${from}-to-${to}.csv`, toCsv(rows));
    setMsg(`Exported ${rows.length} ${kind}.`);
  }

  return (
    <>
      <PageHeader title="Reports" sub="CSV export of bookings and payments by date range" />
      <Card className="max-w-xl space-y-4 p-5">
        <SectionTitle>Date range</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="from"><Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="to"><Input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button icon={<Download className="size-4" />} loading={busy === 'bookings'} onClick={exportBookings}>Bookings CSV</Button>
          <Button variant="outline" icon={<Download className="size-4" />} loading={busy === 'payments'} onClick={exportPayments}>Payments CSV</Button>
        </div>
        {msg && <Alert tone="blue">{msg}</Alert>}
      </Card>
    </>
  );
}
