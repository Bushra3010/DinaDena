'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { PageHeader, Table, Td } from '@/components/admin/AdminShell';
import { Avatar, Input, PageLoader } from '@/components/ui';
import { dateOnly, rupees } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function Customers() {
  const [q, setQ] = useState('');
  const { data, loading } = useLoad(async () => {
    const [{ data: people }, { data: jobs }, { data: pays }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'customer').order('created_at', { ascending: false }),
      supabase.from('jobs').select('customer_id, created_at'),
      supabase.from('payments').select('customer_id, amount').eq('status', 'success'),
    ]);
    return ((people ?? []) as Profile[]).map((p) => {
      const js = (jobs ?? []).filter((j) => j.customer_id === p.id);
      return {
        ...p, jobs: js.length,
        lastJob: js.map((j) => j.created_at).sort().at(-1),
        spent: (pays ?? []).filter((x) => x.customer_id === p.id).reduce((s, x) => s + x.amount, 0),
      };
    });
  }, []);
  const rows = (data ?? []).filter((r) => !q.trim() || `${r.full_name} ${r.phone}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader title="Customers" sub="Households and businesses hiring on DiNaDeNa"
        actions={<div className="relative w-64"><Search className="absolute left-3 top-3.5 size-4 text-muted" /><Input aria-label="Search customers" className="pl-9" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>} />
      {loading && !data ? <PageLoader /> : (
        <Table empty={!rows.length} head={['Customer', 'Phone', 'Language', 'Jobs', 'Total paid', 'Last job', 'Joined']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><div className="flex items-center gap-2"><Avatar name={r.full_name} url={r.avatar_url} size={32} /><span className="font-medium">{r.full_name ?? '—'}</span></div></Td>
              <Td>{r.phone}</Td>
              <Td className="uppercase">{r.language}</Td>
              <Td className="tabular-nums">{r.jobs}</Td>
              <Td className="tabular-nums">{rupees(r.spent)}</Td>
              <Td className="text-xs text-muted">{r.lastJob ? dateOnly(r.lastJob) : '—'}</Td>
              <Td className="text-xs text-muted">{dateOnly(r.created_at)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
