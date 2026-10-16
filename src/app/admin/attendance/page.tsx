'use client';

import Link from 'next/link';
import { PageHeader, Table, Td } from '@/components/admin/AdminShell';
import { Badge, PageLoader } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { useLoad, useRealtime } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';

type Log = { id: string; booking_id: string; kind: 'in' | 'out'; at: string; lat: number | null; lng: number | null };

export default function Attendance() {
  const { data, loading, reload } = useLoad(async () => {
    const { data: logs } = await supabase.from('attendance_logs').select('*').order('at', { ascending: false }).limit(100);
    const ls = (logs ?? []) as Log[];
    const { data: bookings } = ls.length ? await supabase.from('bookings').select('id, job_id, worker_id').in('id', ls.map((l) => l.booking_id)) : { data: [] };
    const bs = bookings ?? [];
    const [{ data: people }, { data: jobs }] = await Promise.all([
      bs.length ? supabase.from('profiles').select('id, full_name').in('id', bs.map((b) => b.worker_id)) : Promise.resolve({ data: [] }),
      bs.length ? supabase.from('jobs').select('id, code, title').in('id', bs.map((b) => b.job_id)) : Promise.resolve({ data: [] }),
    ]);
    return ls.map((l) => {
      const b = bs.find((x) => x.id === l.booking_id);
      return { ...l, worker: people?.find((p) => p.id === b?.worker_id)?.full_name, job: jobs?.find((j) => j.id === b?.job_id) };
    });
  }, []);
  useRealtime('bookings', null, reload);

  return (
    <>
      <PageHeader n="05" title="Attendance" sub="OTP-verified check-ins and check-outs (latest 100)" />
      {loading && !data ? <PageLoader /> : (
        <Table empty={!data?.length} head={['Time', 'Type', 'Worker', 'Job', 'Location']}>
          {data?.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap">{dateTime(l.at)}</Td>
              <Td><Badge tone={l.kind === 'in' ? 'green' : 'blue'}>{l.kind === 'in' ? 'Check in' : 'Check out'}</Badge></Td>
              <Td className="font-medium">{l.worker}</Td>
              <Td>{l.job && <Link href={`/admin/jobs/${l.job.id}`} className="text-brand-600"><span className="font-mono text-xs">{l.job.code}</span> {l.job.title}</Link>}</Td>
              <Td className="font-mono text-xs text-muted">{l.lat != null ? `${l.lat.toFixed(4)}, ${l.lng?.toFixed(4)}` : '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
