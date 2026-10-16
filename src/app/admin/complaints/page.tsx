'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader, Table, Td } from '@/components/admin/AdminShell';
import { Alert, Badge, Button, Card, Chip, Field, KeyValue, Modal, PageLoader, Select, statusTone, Textarea } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Complaint, ComplaintStatus } from '@/lib/types';

const STATUSES: ComplaintStatus[] = ['open', 'in_review', 'resolved', 'dismissed'];

export default function Complaints() {
  const [filter, setFilter] = useState<ComplaintStatus | 'active' | null>('active');
  const [open, setOpen] = useState<Complaint | null>(null);

  const { data, loading, reload } = useLoad(async () => {
    let q = supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(100);
    if (filter === 'active') q = q.in('status', ['open', 'in_review']);
    else if (filter) q = q.eq('status', filter);
    const { data: rows } = await q;
    const cs = (rows ?? []) as Complaint[];
    const [{ data: people }, { data: jobs }] = await Promise.all([
      cs.length ? supabase.from('profiles').select('id, full_name, role').in('id', cs.map((c) => c.raised_by)) : Promise.resolve({ data: [] }),
      cs.length ? supabase.from('jobs').select('id, code').in('id', cs.map((c) => c.job_id).filter(Boolean) as string[]) : Promise.resolve({ data: [] }),
    ]);
    return { complaints: cs, people: people ?? [], jobs: jobs ?? [] };
  }, [filter]);

  return (
    <>
      <PageHeader n="06" title="Complaints & Safety" sub="Disputes, safety reports and service issues" />
      <div className="mb-3 flex flex-wrap gap-2">
        {(['active', null, ...STATUSES] as const).map((f) => (
          <Chip key={f ?? 'all'} active={filter === f} onClick={() => setFilter(f)}>{f === 'active' ? 'Open & in review' : f ? f.replace('_', ' ') : 'All'}</Chip>
        ))}
      </div>
      {loading && !data ? <PageLoader /> : (
        <Table empty={!data?.complaints.length} head={['ID', 'Raised by', 'Job', 'Topic', 'Priority', 'Created', 'Status', '']}>
          {data?.complaints.map((c) => {
            const by = data.people.find((p) => p.id === c.raised_by);
            return (
              <tr key={c.id}>
                <Td className="font-mono text-xs">{c.code}</Td>
                <Td><p className="font-medium">{by?.full_name}</p><p className="text-xs capitalize text-muted">{by?.role}</p></Td>
                <Td>{c.job_id && <Link href={`/admin/jobs/${c.job_id}`} className="font-mono text-xs font-semibold text-brand-600">{data.jobs.find((j) => j.id === c.job_id)?.code}</Link>}</Td>
                <Td className="max-w-56"><p className="font-medium">{c.topic}</p><p className="truncate text-xs text-muted">{c.description}</p></Td>
                <Td><Badge tone={statusTone[c.priority]}>{c.priority}</Badge></Td>
                <Td className="whitespace-nowrap text-xs text-muted">{dateTime(c.created_at)}</Td>
                <Td><Badge tone={statusTone[c.status]}>{c.status.replace('_', ' ')}</Badge></Td>
                <Td><Button size="sm" variant="outline" onClick={() => setOpen(c)}>Handle</Button></Td>
              </tr>
            );
          })}
        </Table>
      )}
      {open && <HandleModal complaint={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); reload(); }} />}
    </>
  );
}

function HandleModal({ complaint, onClose, onSaved }: { complaint: Complaint; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<ComplaintStatus>(complaint.status);
  const [note, setNote] = useState(complaint.admin_note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={`${complaint.code} · ${complaint.topic}`}>
      <div className="space-y-4">
        <Card className="p-3 text-sm">{complaint.description}</Card>
        <KeyValue k="Created" v={dateTime(complaint.created_at)} />
        <Field label="Status" htmlFor="f1">
          <Select id="f1" value={status} onChange={(e) => setStatus(e.target.value as ComplaintStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Admin note" htmlFor="f2">
          <Textarea id="f2" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert tone="red">{error}</Alert>}
        <Button full loading={busy} onClick={async () => {
          setBusy(true);
          const { error } = await supabase.from('complaints').update({
            status, admin_note: note.trim() || null,
            resolved_at: status === 'resolved' || status === 'dismissed' ? new Date().toISOString() : null,
          }).eq('id', complaint.id);
          if (error) { setError(error.message); setBusy(false); } else onSaved();
        }}>Save</Button>
      </div>
    </Modal>
  );
}
