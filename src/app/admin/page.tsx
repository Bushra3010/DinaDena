'use client';

import Link from 'next/link';
import { Activity, CircleAlert, ClipboardList, HardHat, IndianRupee, ShieldAlert, Users, Wifi } from 'lucide-react';
import { DemandChart } from '@/components/admin/DemandChart';
import { PageHeader, StatCard } from '@/components/admin/AdminShell';
import { MapView } from '@/components/Map';
import { Badge, Card, PageLoader, SectionTitle, statusTone } from '@/components/ui';
import { rupees, timeAgo } from '@/lib/format';
import { CITY } from '@/lib/geo';
import { useLoad, useRealtime } from '@/lib/hooks';
import { rpc, supabase } from '@/lib/supabase';
import type { Complaint, Job } from '@/lib/types';

type Stats = {
  bookings_today: number; jobs_today: number; active_jobs: number; open_requests: number; revenue_today: number;
  revenue_total: number; platform_fees_total: number; new_workers: number; pending_workers: number; workers_online: number;
  customers: number; open_complaints: number; completion_rate: number; daily: { day: string; jobs: number; completed: number }[];
};

export default function AdminDashboard() {
  const { data, loading, reload } = useLoad(async () => {
    const [stats, { data: live }, { data: complaints }, { data: pending }] = await Promise.all([
      rpc<Stats>('admin_dashboard_stats'),
      supabase.from('jobs').select('*').in('status', ['open', 'booked', 'in_progress']).order('created_at', { ascending: false }).limit(50),
      supabase.from('complaints').select('*').in('status', ['open', 'in_review']).order('created_at', { ascending: false }).limit(5),
      supabase.from('worker_profiles').select('user_id, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    ]);
    return { stats, live: (live ?? []) as Job[], complaints: (complaints ?? []) as Complaint[], pending: pending ?? [] };
  }, []);
  useRealtime('jobs', null, reload);
  useRealtime('bookings', null, reload);

  if (loading && !data) return <PageLoader />;
  if (!data) return null;
  const s = data.stats;

  return (
    <>
      <PageHeader n="01" title="Dashboard" sub="Overview of all jobs and operations" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Jobs posted today" value={s.jobs_today} icon={<ClipboardList className="size-6" />} hint={`${s.bookings_today} bookings`} />
        <StatCard label="Active jobs" value={s.active_jobs} icon={<Activity className="size-6" />} tone="blue" hint={`${s.open_requests} open requests`} />
        <StatCard label="Revenue today" value={rupees(s.revenue_today)} icon={<IndianRupee className="size-6" />} tone="green" hint={`${rupees(s.revenue_total)} all time`} />
        <StatCard label="New workers (7 days)" value={s.new_workers} icon={<HardHat className="size-6" />} tone="amber" hint={`${s.pending_workers} pending verification`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="p-5 xl:col-span-3">
          <SectionTitle>Job demand trend · last 7 days</SectionTitle>
          <DemandChart days={s.daily} />
        </Card>
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="font-bold">Live job requests</h2>
            <Link href="/admin/requests" className="text-sm font-semibold text-brand-600">View all</Link>
          </div>
          <MapView className="mx-5 mb-5 h-64" center={CITY} zoom={12}
            markers={data.live.map((j) => ({ id: j.id, lat: j.lat, lng: j.lng, kind: 'job' as const, tooltip: `${j.code} · ${j.title}` }))} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle>Quick stats</SectionTitle>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-muted">Workers online</dt><dd className="flex items-center gap-1.5 text-xl font-bold"><Wifi className="size-4 text-emerald-600" />{s.workers_online}</dd></div>
            <div><dt className="text-muted">Customers</dt><dd className="flex items-center gap-1.5 text-xl font-bold"><Users className="size-4 text-muted" />{s.customers}</dd></div>
            <div><dt className="text-muted">Completion rate</dt><dd className="text-xl font-bold">{s.completion_rate}%</dd></div>
            <div><dt className="text-muted">Platform fees</dt><dd className="text-xl font-bold">{rupees(s.platform_fees_total)}</dd></div>
          </dl>
        </Card>
        <Card className="p-5">
          <SectionTitle action={<Link href="/admin/complaints" className="text-sm font-semibold text-brand-600">View all</Link>}>Recent alerts</SectionTitle>
          <ul className="space-y-3 text-sm">
            {data.complaints.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-500" />
                <span className="flex-1"><b>{c.topic}</b><span className="block text-xs text-muted">{c.code} · {timeAgo(c.created_at)}</span></span>
                <Badge tone={statusTone[c.priority]}>{c.priority}</Badge>
              </li>
            ))}
            {data.pending.map((p) => (
              <li key={p.user_id} className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <Link href="/admin/workers?tab=pending" className="flex-1"><b>Worker awaiting verification</b><span className="block text-xs text-muted">{timeAgo(p.created_at)}</span></Link>
              </li>
            ))}
            {!data.complaints.length && !data.pending.length && <li className="text-muted">No alerts</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <SectionTitle>Open & active jobs</SectionTitle>
          <ul className="space-y-2.5 text-sm">
            {data.live.slice(0, 6).map((j) => (
              <li key={j.id}>
                <Link href={`/admin/jobs/${j.id}`} className="flex items-center gap-2 hover:text-brand-600">
                  <span className="font-mono text-xs text-muted">{j.code}</span>
                  <span className="flex-1 truncate font-medium">{j.title}</span>
                  <Badge tone={statusTone[j.status]}>{j.status.replace('_', ' ')}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
