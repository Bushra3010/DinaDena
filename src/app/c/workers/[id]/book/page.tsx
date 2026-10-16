'use client';

import { Suspense, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { PlacePicker } from '@/components/PlacePicker';
import { Alert, Avatar, Button, Card, Field, Input, KeyValue, PageLoader, Select, Stars, Textarea, TopBar } from '@/components/ui';
import { rupees } from '@/lib/format';
import { useCategories, useLoad } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useMyPlace, type Place } from '@/lib/location';
import { rpc } from '@/lib/supabase';
import type { Quote, WorkerCard } from '@/lib/types';

const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function BookPage() {
  return <Suspense><BookWorker /></Suspense>;
}

function BookWorker() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { t, catName } = useI18n();
  const categories = useCategories();
  const { place: myPlace } = useMyPlace();
  const [categoryId, setCategoryId] = useState(params.get('category') ?? '');
  const [date, setDate] = useState(localDate());
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState(1);
  const [notes, setNotes] = useState('');
  const [place, setPlace] = useState<Place>(myPlace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: worker, loading } = useLoad(async () => {
    const r = await rpc<WorkerCard[]>('get_worker_card', { p_worker: id, p_lat: myPlace.lat, p_lng: myPlace.lng });
    return r[0] ?? null;
  }, [id]);
  const catId = categoryId || worker?.category_ids[0] || '';
  const { data: quote } = useLoad(async () => catId
    ? rpc<Quote>('price_quote', { p_category: catId, p_minutes: days * 480, p_workers: 1, p_worker: id })
    : null, [catId, days, id]);

  if (loading && !worker) return <PageLoader />;
  if (!worker) return <TopBar title={t('something_wrong')} back />;

  async function confirm() {
    setError(null);
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) return setError(t('work_date') + ': ' + t('required'));
    setBusy(true);
    try {
      const jobId = await rpc<string>('book_worker', {
        p_worker: id,
        p_category: catId,
        p_description: notes.trim() || null,
        p_address: place.address?.trim() ? `${place.address.trim()}, ${place.area}` : `${place.area}, Jaipur`,
        p_area: place.area,
        p_lat: place.lat,
        p_lng: place.lng,
        p_start_at: start.toISOString(),
        p_duration_minutes: days * 480,
      });
      router.replace(`/c/jobs/${jobId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="bg-white pb-28">
      <TopBar title={t('booking_review')} back />
      <div className="space-y-5 p-4">
        <Card className="flex items-center gap-3 p-3.5">
          <Avatar name={worker.full_name} url={worker.avatar_url} size={52} />
          <div className="flex-1">
            <p className="font-bold">{worker.full_name}</p>
            <Stars value={worker.rating_avg} count={worker.rating_count} />
          </div>
        </Card>

        <Field label={t('job_type')} htmlFor="cat">
          <Select id="cat" value={catId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.filter((c) => worker.category_ids.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{catName(c)}</option>)}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('work_date')} htmlFor="date">
            <Input id="date" type="date" min={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('start_time')} htmlFor="time">
            <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">{t('number_of_days')}</p>
          <div className="flex items-center justify-between rounded-xl border border-line p-1">
            <Button type="button" variant="ghost" size="sm" aria-label="Fewer days" onClick={() => setDays((d) => Math.max(1, d - 1))}><Minus className="size-4" /></Button>
            <span className="text-lg font-bold tabular-nums" aria-live="polite">{days}</span>
            <Button type="button" variant="ghost" size="sm" aria-label="More days" onClick={() => setDays((d) => Math.min(7, d + 1))}><Plus className="size-4" /></Button>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">{t('location')}</p>
          <PlacePicker value={place} onChange={setPlace} />
        </div>

        <Field label={<>{t('description')} <span className="font-normal text-muted">({t('optional')})</span></>} htmlFor="notes">
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>

        {quote && (
          <Card className="bg-brand-50/60 p-4">
            <KeyValue k={`${t('labour_amount')} (${days} × ${rupees(quote.rate_per_worker / days)})`} v={rupees(quote.labour_total)} />
            <KeyValue k={t('platform_fee')} v={rupees(quote.fee_total)} />
            <div className="my-1.5 border-t border-brand-200" />
            <KeyValue strong k={t('estimated_amount')} v={rupees(quote.total)} />
          </Card>
        )}
        {error && <Alert tone="red">{error}</Alert>}
      </div>
      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button size="lg" full loading={busy} onClick={confirm}>{t('confirm_booking')}</Button>
      </div>
    </div>
  );
}
