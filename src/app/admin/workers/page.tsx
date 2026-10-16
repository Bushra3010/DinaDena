'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ban, Check, FileText, Search, X } from 'lucide-react';
import { PageHeader, Table, Td } from '@/components/admin/AdminShell';
import { Alert, Avatar, Badge, Button, Card, Chip, Field, Input, KeyValue, Modal, PageLoader, Stars, statusTone, Textarea } from '@/components/ui';
import { dateOnly, rupees } from '@/lib/format';
import { useCategories, useLoad } from '@/lib/hooks';
import { rpc, supabase } from '@/lib/supabase';
import type { Profile, WorkerPrivate, WorkerProfile, WorkerStatus } from '@/lib/types';

type Row = WorkerProfile & { person?: Profile; priv?: WorkerPrivate };
const TABS: { label: string; value: WorkerStatus | null }[] = [
  { label: 'All', value: null }, { label: 'Pending', value: 'pending' }, { label: 'Approved', value: 'approved' },
  { label: 'Suspended', value: 'suspended' }, { label: 'Rejected', value: 'rejected' },
];

export default function WorkersPage() {
  return <Suspense><Workers /></Suspense>;
}

function Workers() {
  const params = useSearchParams();
  const categories = useCategories();
  const [tab, setTab] = useState(Math.max(0, TABS.findIndex((t) => t.value === params.get('tab'))));
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);

  const { data, loading, reload } = useLoad(async () => {
    let query = supabase.from('worker_profiles').select('*').order('created_at', { ascending: false });
    const f = TABS[tab]!.value;
    if (f) query = query.eq('status', f);
    const { data: wps } = await query;
    const rows = (wps ?? []) as WorkerProfile[];
    const ids = rows.map((r) => r.user_id);
    const [{ data: people }, { data: privs }] = await Promise.all([
      ids.length ? supabase.from('profiles').select('*').in('id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('worker_private').select('*').in('user_id', ids) : Promise.resolve({ data: [] }),
    ]);
    return rows.map((r) => ({
      ...r, person: (people as Profile[]).find((p) => p.id === r.user_id), priv: (privs as WorkerPrivate[]).find((p) => p.user_id === r.user_id),
    })) as Row[];
  }, [tab]);

  const filtered = (data ?? []).filter((r) => !q.trim() || `${r.person?.full_name} ${r.person?.phone} ${r.home_area}`.toLowerCase().includes(q.trim().toLowerCase()));
  const skillNames = (ids: string[]) => categories.filter((c) => ids.includes(c.id)).map((c) => c.name_en).join(', ');

  return (
    <>
      <PageHeader n="04" title="Workers & Verification" sub="Verify workers, manage availability and status" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t, i) => <Chip key={t.label} active={tab === i} onClick={() => setTab(i)}>{t.label}</Chip>)}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-3.5 size-4 text-muted" />
          <Input aria-label="Search workers" className="pl-9" placeholder="Search name, phone, area" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {loading && !data ? <PageLoader /> : (
        <Table empty={!filtered.length} head={['Worker', 'Skills', 'Area', 'Rating', 'Jobs', 'Available', 'Status', 'Joined', '']}>
          {filtered.map((r) => (
            <tr key={r.user_id} className="hover:bg-stone-50">
              <Td><div className="flex items-center gap-2"><Avatar name={r.person?.full_name} url={r.person?.avatar_url} size={34} /><div><p className="font-medium">{r.person?.full_name}</p><p className="text-xs text-muted">{r.person?.phone}</p></div></div></Td>
              <Td className="max-w-48 text-xs">{skillNames(r.category_ids)}</Td>
              <Td>{r.home_area}</Td>
              <Td><Stars value={r.rating_avg} count={r.rating_count} /></Td>
              <Td className="tabular-nums">{r.jobs_completed}</Td>
              <Td>{r.available ? <Badge tone="green">Online</Badge> : <Badge tone="gray">Offline</Badge>}</Td>
              <Td><Badge tone={statusTone[r.status]}>{r.status}</Badge></Td>
              <Td className="whitespace-nowrap text-xs text-muted">{dateOnly(r.created_at)}</Td>
              <Td><Button size="sm" variant={r.status === 'pending' ? 'primary' : 'outline'} onClick={() => setSelected(r)}>{r.status === 'pending' ? 'Review' : 'Manage'}</Button></Td>
            </tr>
          ))}
        </Table>
      )}
      {selected && <WorkerModal row={selected} skills={skillNames(selected.category_ids)} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload(); }} />}
    </>
  );
}

function WorkerModal({ row, skills, onClose, onChanged }: { row: Row; skills: string; onClose: () => void; onChanged: () => void }) {
  const [reason, setReason] = useState(row.rejection_reason ?? '');
  const [rate, setRate] = useState(row.daily_rate?.toString() ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (status: WorkerStatus) => {
    if ((status === 'rejected' || status === 'suspended') && !reason.trim()) return setError('Add a reason for the worker.');
    setBusy(status);
    try {
      await rpc('admin_set_worker_status', { p_worker: row.user_id, p_status: status, p_reason: reason.trim() || null });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const viewDoc = async () => {
    if (!row.priv?.id_doc_path) return;
    const { data, error } = await supabase.storage.from('worker-docs').createSignedUrl(row.priv.id_doc_path, 120);
    if (error) return setError(error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const saveRate = async () => {
    setBusy('rate');
    const { error } = await supabase.from('worker_profiles').update({ daily_rate: rate ? Number(rate) : null }).eq('user_id', row.user_id);
    setBusy(null);
    if (error) setError(error.message);
    else onChanged();
  };

  return (
    <Modal open onClose={onClose} title={row.person?.full_name ?? 'Worker'}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={row.person?.full_name} url={row.person?.avatar_url} size={56} />
          <div><p className="text-sm text-muted">{row.person?.phone}</p><Badge tone={statusTone[row.status]}>{row.status}</Badge></div>
        </div>
        <Card className="p-3">
          <KeyValue k="Skills" v={<span className="text-right">{skills}</span>} />
          <KeyValue k="Experience" v={`${row.experience_years} years`} />
          <KeyValue k="Home area" v={row.home_area} />
          <KeyValue k="ID document" v={row.priv?.id_doc_path
            ? <button type="button" onClick={viewDoc} className="inline-flex items-center gap-1 font-semibold text-brand-600"><FileText className="size-4" />{row.priv.id_doc_type}</button>
            : <span className="text-muted">{row.priv?.id_doc_type ?? '—'} (not uploaded)</span>} />
          <KeyValue k="Bank" v={row.priv?.bank_name ? `${row.priv.bank_name} ••${row.priv.bank_account_last4 ?? ''}` : '—'} />
          <KeyValue k="UPI" v={row.priv?.upi_id ?? '—'} />
        </Card>
        {row.bio && <p className="text-sm text-muted">{row.bio}</p>}
        <Field label="Daily rate override (optional)" hint="Leave empty to use the category rate" htmlFor="rate-override">
          <div className="flex gap-2">
            <Input id="rate-override" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 1000" />
            <Button variant="outline" loading={busy === 'rate'} onClick={saveRate}>Save</Button>
          </div>
          {row.daily_rate && <p className="text-xs text-muted">Current: {rupees(row.daily_rate)}</p>}
        </Field>
        <Field label="Reason (shown to worker when rejecting or suspending)" htmlFor="f1">
          <Textarea id="f1" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Alert tone="red">{error}</Alert>}
        <div className="grid grid-cols-2 gap-2">
          {row.status !== 'approved' && <Button variant="success" icon={<Check className="size-4" />} loading={busy === 'approved'} onClick={() => setStatus('approved')}>Approve</Button>}
          {row.status === 'pending' && <Button variant="danger" icon={<X className="size-4" />} loading={busy === 'rejected'} onClick={() => setStatus('rejected')}>Reject</Button>}
          {row.status === 'approved' && <Button variant="danger" icon={<Ban className="size-4" />} loading={busy === 'suspended'} onClick={() => setStatus('suspended')}>Suspend</Button>}
        </div>
      </div>
    </Modal>
  );
}
