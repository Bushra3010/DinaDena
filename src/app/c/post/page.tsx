'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, Minus, Plus, X } from 'lucide-react';
import { PlacePicker } from '@/components/PlacePicker';
import { Alert, Button, Card, Chip, Field, Input, KeyValue, Select, Textarea, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { duration, rupees } from '@/lib/format';
import { useCategories, useLoad } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useMyPlace, type Place } from '@/lib/location';
import { publicUrl, rpc, supabase, uploadFile } from '@/lib/supabase';
import type { Job, Quote } from '@/lib/types';

const DURATIONS = [60, 90, 120, 180, 240, 480];

export default function PostJobPage() {
  return <Suspense><PostJob /></Suspense>;
}

function PostJob() {
  const { t, lang, catName } = useI18n();
  const { profile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const categories = useCategories();
  const { place: myPlace } = useMyPlace();

  const [chosenCategory, setCategoryId] = useState(params.get('category') ?? '');
  const categoryId = chosenCategory || categories[0]?.id || '';
  const [minStart] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [place, setPlace] = useState<Place>(myPlace);
  const [workers, setWorkers] = useState(2);
  const [minutes, setMinutes] = useState(60);
  const [startMode, setStartMode] = useState<'now' | 'later'>('now');
  const [startAt, setStartAt] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rebook: prefill from an earlier job.
  const rebookId = params.get('rebook');
  useEffect(() => {
    if (!rebookId) return;
    supabase.from('jobs').select('*').eq('id', rebookId).maybeSingle().then(({ data }) => {
      const j = data as Job | null;
      if (!j) return;
      setCategoryId(j.category_id);
      setTitle(j.title);
      setDescription(j.description ?? '');
      setWorkers(j.workers_needed);
      setMinutes(j.duration_minutes);
      setPlace({ lat: j.lat, lng: j.lng, area: j.area ?? '', address: j.address });
    });
  }, [rebookId]);

  const { data: quote } = useLoad(async () => {
    if (!categoryId) return null;
    return rpc<Quote>('price_quote', { p_category: categoryId, p_minutes: minutes, p_workers: workers });
  }, [categoryId, minutes, workers]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!categoryId) return setError(t('required'));
    if (startMode === 'later' && !startAt) return setError(t('start_time') + ': ' + t('required'));
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      if (photo) photoUrl = publicUrl('job-photos', await uploadFile('job-photos', profile!.id, photo));
      const cat = categories.find((c) => c.id === categoryId);
      const id = await rpc<string>('create_quick_job', {
        p_category: categoryId,
        p_title: title.trim() || cat?.name_en,
        p_description: description.trim() || null,
        p_address: place.address?.trim() ? `${place.address.trim()}, ${place.area}` : `${place.area}, Jaipur`,
        p_area: place.area,
        p_lat: place.lat,
        p_lng: place.lng,
        p_start_at: startMode === 'now' ? new Date().toISOString() : new Date(startAt).toISOString(),
        p_duration_minutes: minutes,
        p_workers: workers,
        p_photo_url: photoUrl,
      });
      router.replace(`/c/jobs/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="bg-white pb-28">
      <TopBar title={t('create_request')} back="/c" />
      <form id="post" onSubmit={submit} className="space-y-5 px-4 pt-4">
        <Field label={t('job_type')} htmlFor="cat">
          <Select id="cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{catName(c)}</option>)}
          </Select>
        </Field>
        <Field label={<>{t('job_title')} <span className="font-normal text-muted">({t('optional')})</span></>} htmlFor="title">
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Unload goods from vehicle" maxLength={80} />
        </Field>
        <Field label={<>{t('description')} <span className="font-normal text-muted">({t('optional')})</span></>} htmlFor="desc">
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('description_ph')} maxLength={500} />
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-semibold">{t('add_photo')} <span className="font-normal text-muted">({t('optional')})</span></p>
          {photo ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(photo)} alt="" className="size-24 rounded-xl object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)} className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-white"><X className="size-3.5" /></button>
            </div>
          ) : (
            <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs text-muted hover:border-brand-300">
              <Camera className="size-6" />
              {t('add_photo')}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">{t('location')}</p>
          <PlacePicker value={place} onChange={setPlace} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1.5 text-sm font-semibold">{t('number_of_workers')}</p>
            <div className="flex items-center justify-between rounded-xl border border-line p-1">
              <Button type="button" variant="ghost" size="sm" aria-label="Fewer" onClick={() => setWorkers((w) => Math.max(1, w - 1))}><Minus className="size-4" /></Button>
              <span className="text-lg font-bold tabular-nums" aria-live="polite">{workers}</span>
              <Button type="button" variant="ghost" size="sm" aria-label="More" onClick={() => setWorkers((w) => Math.min(10, w + 1))}><Plus className="size-4" /></Button>
            </div>
          </div>
          <Field label={t('estimated_duration')} htmlFor="dur">
            <Select id="dur" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {DURATIONS.map((m) => <option key={m} value={m}>{duration(m, lang)}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">{t('start_time')}</p>
          <div className="flex gap-2">
            <Chip active={startMode === 'now'} onClick={() => setStartMode('now')}>{t('start_now')}</Chip>
            <Chip active={startMode === 'later'} onClick={() => setStartMode('later')}>{t('start_later')}</Chip>
          </div>
          {startMode === 'later' && (
            <Input type="datetime-local" className="mt-2" aria-label={t('start_time')} value={startAt}
              min={minStart}
              onChange={(e) => setStartAt(e.target.value)} />
          )}
        </div>

        {quote && (
          <Card className="bg-brand-50/60 p-4">
            <KeyValue k={`${t('labour_amount')} (${workers} × ${rupees(quote.rate_per_worker)})`} v={rupees(quote.labour_total)} />
            <KeyValue k={t('platform_fee')} v={rupees(quote.fee_total)} />
            <div className="my-1.5 border-t border-brand-200" />
            <KeyValue strong k={t('total_amount')} v={rupees(quote.total)} />
          </Card>
        )}
        {error && <Alert tone="red">{error}</Alert>}
      </form>
      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button type="submit" form="post" size="lg" full loading={busy}>{busy ? t('posting') : t('post_request')}</Button>
      </div>
    </div>
  );
}
