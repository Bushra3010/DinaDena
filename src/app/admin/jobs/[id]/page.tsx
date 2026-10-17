'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Check, Flag, RotateCcw } from 'lucide-react';
import { PageHeader, Table, Td } from '@/components/admin/AdminShell';
import { MapView, type MapMarker } from '@/components/Map';
import { Alert, Avatar, Badge, Button, Card, cx, KeyValue, Modal, PageLoader, SectionTitle, statusTone, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, duration, rupees, timeOnly } from '@/lib/format';
import { useCategories, useLoad, useRealtime } from '@/lib/hooks';
import { rpc, supabase } from '@/lib/supabase';
import type { Booking, Job, Payment, Profile, WorkerLocation } from '@/lib/types';

export default function AdminJob() {
  const { id } = useParams<{ id: string }>();
  const { profile: me } = useAuth();
  const categories = useCategories();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'red' | 'green'; text: string } | null>(null);

  const { data, loading, reload } = useLoad(async () => {
    const [{ data: job }, { data: bookings }, { data: payments }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('bookings').select('*').eq('job_id', id).order('created_at'),
      supabase.from('payments').select('*').eq('job_id', id).order('created_at'),
    ]);
    const j = job as Job;
    const bs = (bookings ?? []) as Booking[];
    const [{ data: people }, { data: locs }] = await Promise.all([
      supabase.from('profiles').select('*').in('id', [j.customer_id, ...bs.map((b) => b.worker_id)]),
      bs.length ? supabase.from('worker_locations').select('*').in('booking_id', bs.map((b) => b.id)).order('recorded_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    ]);
    const latest: Record<string, WorkerLocation> = {};
    for (const l of (locs ?? []) as WorkerLocation[]) latest[l.booking_id] ??= l;
    return { job: j, bookings: bs, payments: (payments ?? []) as Payment[], people: (people ?? []) as Profile[], latest };
  }, [id]);
  useRealtime('bookings', `job_id=eq.${id}`, reload);
  useRealtime('worker_locations', null, reload);

  if (loading && !data) return <PageLoader />;
  if (!data?.job) return null;
  const { job, bookings, payments, people, latest } = data;
  const person = (pid: string) => people.find((p) => p.id === pid);
  const customer = person(job.customer_id);
  const cat = categories.find((c) => c.id === job.category_id);

  const stages = [
    { label: 'Requested', at: job.created_at },
    { label: 'Accepted', at: bookings.filter((b) => !['requested', 'rejected', 'expired'].includes(b.status)).map((b) => b.responded_at).filter(Boolean).sort()[0] },
    { label: 'On the way', at: bookings.map((b) => b.on_the_way_at).filter(Boolean).sort()[0] },
    { label: 'Work started', at: bookings.map((b) => b.check_in_at).filter(Boolean).sort()[0] },
    { label: 'Completed', at: bookings.every((b) => !b.check_out_at) ? null : bookings.map((b) => b.check_out_at).filter(Boolean).sort().at(-1) },
    { label: 'Paid', at: bookings.map((b) => b.paid_at).filter(Boolean).sort().at(-1) },
  ];

  const markers: MapMarker[] = [
    { id: 'job', lat: job.lat, lng: job.lng, kind: 'job', tooltip: job.area ?? '' },
    ...bookings.filter((b) => latest[b.id]).map((b) => ({ id: b.id, lat: latest[b.id]!.lat, lng: latest[b.id]!.lng, kind: 'worker' as const, label: person(b.worker_id)?.full_name?.[0] ?? '?', tooltip: person(b.worker_id)?.full_name ?? '' })),
  ];

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'green', text: ok });
      reload();
    } catch (e) {
      setMsg({ tone: 'red', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Link href="/admin/requests" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" />Live Requests</Link>
      <PageHeader n="03" title={`Job ${job.code}`} sub={[job.title, cat?.name_en !== job.title && cat?.name_en, job.job_type].filter(Boolean).join(' · ')}
        actions={<Button variant="danger" size="sm" icon={<Flag className="size-4" />} onClick={() => setDisputeOpen(true)}>Mark dispute</Button>} />
      {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}

      <Card className="mb-4 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div><p className="text-xs text-muted">Status</p><Badge tone={statusTone[job.status]}>{job.status.replace('_', ' ')}</Badge></div>
        <div><p className="text-xs text-muted">Customer</p><p className="font-semibold">{customer?.full_name}</p><p className="text-xs text-muted">{customer?.phone}</p></div>
        <div><p className="text-xs text-muted">Start</p><p className="font-semibold">{dateTime(job.start_at)}</p><p className="text-xs text-muted">{duration(job.duration_minutes)}</p></div>
        <div><p className="text-xs text-muted">Location</p><p className="font-semibold">{job.area}</p><p className="truncate text-xs text-muted">{job.address}</p></div>
        <div><p className="text-xs text-muted">Estimate</p><p className="font-semibold">{rupees((job.rate_per_worker + job.platform_fee) * job.workers_needed)}</p><p className="text-xs text-muted">{job.workers_needed} × {rupees(job.rate_per_worker)} + fee</p></div>
      </Card>

      <Card className="mb-4 p-5">
        <SectionTitle>Timeline</SectionTitle>
        <ol className="grid grid-cols-3 gap-y-4 sm:grid-cols-6">
          {stages.map((s, i) => (
            <li key={s.label} className="relative flex flex-col items-center text-center">
              {i > 0 && <span className={cx('absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2', s.at ? 'bg-brand-500' : 'bg-slate-200')} />}
              <span className={cx('relative z-10 flex size-8 items-center justify-center rounded-full', s.at ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-500')}>
                {s.at ? <Check className="size-4" /> : i + 1}
              </span>
              <span className="mt-1.5 text-xs font-semibold">{s.label}</span>
              <span className="text-xs text-muted">{s.at ? timeOnly(s.at) : '—'}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionTitle>Worker assignments ({bookings.length}/{job.workers_needed})</SectionTitle>
          <Table empty={!bookings.length} head={['Worker', 'Status', 'Check in', 'Check out', 'Amount', 'Paid', '']}>
            {bookings.map((b) => {
              const w = person(b.worker_id);
              const paid = payments.find((p) => p.booking_id === b.id && (p.status === 'success' || p.status === 'refunded'));
              return (
                <tr key={b.id}>
                  <Td><div className="flex items-center gap-2"><Avatar name={w?.full_name} size={32} /><div><p className="font-medium">{w?.full_name}</p><p className="text-xs text-muted">{w?.phone}</p></div></div></Td>
                  <Td><Badge tone={statusTone[b.status]}>{b.status.replace(/_/g, ' ')}</Badge></Td>
                  <Td className="text-xs">{b.check_in_at ? timeOnly(b.check_in_at) : '—'}</Td>
                  <Td className="text-xs">{b.check_out_at ? timeOnly(b.check_out_at) : '—'}</Td>
                  <Td className="tabular-nums">{rupees(b.amount + b.platform_fee)}</Td>
                  <Td>{paid ? <Badge tone={statusTone[paid.status]}>{paid.status}</Badge> : <span className="text-xs text-muted">—</span>}</Td>
                  <Td>{paid?.status === 'success' && (
                    <Button size="sm" variant="outline" icon={<RotateCcw className="size-3.5" />} loading={busy === b.id}
                      onClick={() => act(b.id, () => rpc('admin_refund_booking', { p_booking: b.id }), 'Refund recorded')}>Refund</Button>
                  )}</Td>
                </tr>
              );
            })}
          </Table>
          {payments.length > 0 && (
            <Card className="mt-4 p-5">
              <SectionTitle>Payments</SectionTitle>
              {payments.map((p) => (
                <KeyValue key={p.id} k={<span className="font-mono text-xs">{p.gateway_payment_id ?? p.gateway_order_id} · {dateTime(p.created_at)}</span>}
                  v={<span className="flex items-center gap-2">{rupees(p.amount)}<Badge tone={statusTone[p.status]}>{p.status}</Badge></span>} />
              ))}
            </Card>
          )}
        </div>
        <Card className="overflow-hidden p-5">
          <SectionTitle>Live location</SectionTitle>
          <MapView className="h-72" center={job} markers={markers} />
        </Card>
      </div>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Mark as dispute">
        <Textarea aria-label="Dispute note" placeholder="What is disputed?" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button full className="mt-3" loading={busy === 'dispute'} disabled={!note.trim()} onClick={() => act('dispute', async () => {
          const { error } = await supabase.from('complaints').insert({
            job_id: job.id, booking_id: bookings[0]?.id ?? null, raised_by: me!.id, topic: 'Dispute (admin)',
            description: note.trim(), priority: 'high', status: 'in_review',
          });
          if (error) throw new Error(error.message);
          setDisputeOpen(false);
          setNote('');
        }, 'Dispute opened in Complaints')}>Create dispute</Button>
      </Modal>
    </>
  );
}
