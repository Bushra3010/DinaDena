'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader, Table, Td } from '@/components/admin/AdminShell';
import { CategoryIcon, ICON_NAMES } from '@/components/CategoryIcon';
import { Alert, Button, Card, Field, Input, Modal, PageLoader, SectionTitle, Select, Toggle } from '@/components/ui';
import { fetchCategories, useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Category, Settings } from '@/lib/types';

export default function Categories() {
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const { data, loading, reload } = useLoad(async () => {
    const [cats, { data: settings }] = await Promise.all([
      fetchCategories(true),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
    ]);
    return { cats, settings: settings as Settings };
  }, []);

  return (
    <>
      <PageHeader title="Categories & Pricing" sub="Trades and the rates customers are charged. Only admins can change rates."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing({ active: true, icon: 'hammer', daily_rate: 800, hourly_rate: 200 })}>Add category</Button>} />
      {loading && !data ? <PageLoader /> : data && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Table empty={!data.cats.length} head={['Trade', 'Hindi', 'Daily rate (8h)', 'Hourly (quick jobs)', 'Active', '']}>
              {data.cats.map((c) => (
                <tr key={c.id}>
                  <Td><div className="flex items-center gap-2"><CategoryIcon icon={c.icon} boxed className="size-9 rounded-xl" /><span className="font-medium">{c.name_en}</span></div></Td>
                  <Td>{c.name_hi}</Td>
                  <Td className="tabular-nums">₹{c.daily_rate}</Td>
                  <Td className="tabular-nums">₹{c.hourly_rate}</Td>
                  <Td><Toggle checked={c.active} label={`${c.name_en} active`} onChange={async (v) => { await supabase.from('categories').update({ active: v }).eq('id', c.id); reload(); }} /></Td>
                  <Td><Button size="sm" variant="outline" onClick={() => setEditing(c)}>Edit</Button></Td>
                </tr>
              ))}
            </Table>
          </div>
          <SettingsCard settings={data.settings} onSaved={reload} />
        </div>
      )}
      {editing && <CategoryModal value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function CategoryModal({ value, onClose, onSaved }: { value: Partial<Category>; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Category>) => setC((x) => ({ ...x, ...patch }));

  async function save() {
    if (!c.name_en?.trim() || !c.name_hi?.trim() || !c.daily_rate || !c.hourly_rate) return setError('All fields are required.');
    setBusy(true);
    const row = {
      name_en: c.name_en.trim(), name_hi: c.name_hi.trim(), icon: c.icon ?? 'hammer',
      daily_rate: c.daily_rate, hourly_rate: c.hourly_rate, active: c.active ?? true,
    };
    const { error } = c.id
      ? await supabase.from('categories').update(row).eq('id', c.id)
      : await supabase.from('categories').insert({ ...row, slug: row.name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-'), sort: 99 });
    setBusy(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <Modal open onClose={onClose} title={c.id ? `Edit ${value.name_en}` : 'Add category'}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name (English)" htmlFor="f1"><Input id="f1" value={c.name_en ?? ''} onChange={(e) => set({ name_en: e.target.value })} /></Field>
          <Field label="Name (Hindi)" htmlFor="f2"><Input id="f2" value={c.name_hi ?? ''} onChange={(e) => set({ name_hi: e.target.value })} /></Field>
          <Field label="Daily rate ₹" htmlFor="f3"><Input id="f3" inputMode="numeric" value={c.daily_rate ?? ''} onChange={(e) => set({ daily_rate: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
          <Field label="Hourly rate ₹" htmlFor="f4"><Input id="f4" inputMode="numeric" value={c.hourly_rate ?? ''} onChange={(e) => set({ hourly_rate: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
        </div>
        <Field label="Icon" htmlFor="f5">
          <div className="flex items-center gap-2">
            <CategoryIcon icon={c.icon} boxed className="size-11" />
            <Select id="f5" value={c.icon} onChange={(e) => set({ icon: e.target.value })}>{ICON_NAMES.map((n) => <option key={n}>{n}</option>)}</Select>
          </div>
        </Field>
        {error && <Alert tone="red">{error}</Alert>}
        <Button full loading={busy} onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

function SettingsCard({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (v: string) => Number(v.replace(/\D/g, '')) || 0;
  return (
    <Card className="h-fit space-y-3 p-5">
      <SectionTitle>Platform settings</SectionTitle>
      <Field label="Platform fee per worker ₹" htmlFor="f6"><Input id="f6" inputMode="numeric" value={s.platform_fee_per_worker} onChange={(e) => setS({ ...s, platform_fee_per_worker: num(e.target.value) })} /></Field>
      <Field label="Worker response time (minutes)" htmlFor="f7"><Input id="f7" inputMode="numeric" value={s.request_timeout_minutes} onChange={(e) => setS({ ...s, request_timeout_minutes: num(e.target.value) })} /></Field>
      <Field label="Search radius (km)" htmlFor="f8"><Input id="f8" inputMode="numeric" value={s.search_radius_km} onChange={(e) => setS({ ...s, search_radius_km: num(e.target.value) })} /></Field>
      {msg && <Alert tone={msg === 'Saved' ? 'green' : 'red'}>{msg}</Alert>}
      <Button full loading={busy} onClick={async () => {
        setBusy(true);
        const { error } = await supabase.from('app_settings').update({
          platform_fee_per_worker: s.platform_fee_per_worker, request_timeout_minutes: s.request_timeout_minutes, search_radius_km: s.search_radius_km,
        }).eq('id', 1);
        setBusy(false);
        setMsg(error ? error.message : 'Saved');
        if (!error) onSaved();
      }}>Save settings</Button>
    </Card>
  );
}
