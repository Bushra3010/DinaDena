'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, ChevronRight, Clock, IndianRupee, MapPin, Users } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Alert, Avatar, Button, Modal } from '@/components/ui';
import { duration, elapsed, km, rupees } from '@/lib/format';
import { useCategories, useLoad, useRealtime, useTick } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc, supabase } from '@/lib/supabase';
import type { Booking, Job, NearbyJob } from '@/lib/types';

type Incoming =
  | { kind: 'request'; booking: Booking; job: Job; customer: string | null }
  | { kind: 'quick'; job: NearbyJob; notificationId: string };

/** Pops up direct booking requests and new nearby quick jobs (design screen 04). */
export function IncomingRequests({ userId }: { userId: string }) {
  const { t, lang, catName } = useI18n();
  const router = useRouter();
  const categories = useCategories();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, reload } = useLoad(async (): Promise<Incoming | null> => {
    const { data: reqs } = await supabase.from('bookings').select('*').eq('worker_id', userId).eq('status', 'requested')
      .gt('expires_at', new Date().toISOString()).order('created_at').limit(5);
    const req = ((reqs ?? []) as Booking[]).find((b) => !dismissed.includes(b.id));
    if (req) {
      const { data: job } = await supabase.from('jobs').select('*').eq('id', req.job_id).single();
      const { data: c } = await supabase.from('public_profiles').select('full_name').eq('id', req.customer_id).maybeSingle();
      return { kind: 'request', booking: req, job: job as Job, customer: c?.full_name ?? null };
    }
    const since = new Date(Date.now() - 3 * 60_000).toISOString();
    const { data: notes } = await supabase.from('notifications').select('id, link').eq('user_id', userId).eq('read', false)
      .like('link', '/w/jobs/%').gt('created_at', since).order('created_at', { ascending: false }).limit(5);
    const note = (notes ?? []).find((n) => !dismissed.includes(n.id));
    if (!note) return null;
    const jobId = note.link!.split('/').pop();
    const nearby = await rpc<NearbyJob[]>('nearby_open_jobs', { p_radius_km: 50 });
    const job = nearby.find((j) => j.id === jobId);
    if (!job) return null;
    return { kind: 'quick', job, notificationId: note.id };
  }, [userId, dismissed.join(',')]);

  useRealtime('notifications', `user_id=eq.${userId}`, reload);
  useRealtime('bookings', `worker_id=eq.${userId}`, reload);
  const now = useTick(1000, data?.kind === 'request');

  if (!data) return null;
  const job = data.job;
  const cat = categories.find((c) => c.id === job.category_id);
  const id = data.kind === 'request' ? data.booking.id : data.notificationId;

  const dismiss = () => {
    if (data.kind === 'quick') supabase.from('notifications').update({ read: true }).eq('id', data.notificationId).then();
    setDismissed((d) => [...d, id]);
    setError(null);
  };

  async function accept() {
    setBusy('accept');
    setError(null);
    try {
      if (data!.kind === 'request') {
        await rpc('respond_booking', { p_booking: data!.booking.id, p_accept: true });
        dismiss();
        router.push(`/w/bookings/${data!.booking.id}`);
      } else {
        const bookingId = await rpc<string>('accept_job', { p_job: job.id });
        dismiss();
        router.push(`/w/bookings/${bookingId}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    if (data!.kind === 'request') {
      setBusy('decline');
      await rpc('respond_booking', { p_booking: data!.booking.id, p_accept: false }).catch(() => undefined);
      setBusy(null);
    }
    dismiss();
  }

  const slotsLeft = data.kind === 'quick' ? data.job.workers_needed - data.job.slots_filled : 1;
  const pay = job.rate_per_worker;

  return (
    <Modal open onClose={dismiss} dismissable={data.kind === 'quick'}>
      <div className="flex flex-col items-center text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40">
          <BellRing className="size-8" />
        </div>
        <h2 className="mt-3 text-xl font-extrabold text-brand-600">{data.kind === 'request' ? t('new_booking_request') : t('new_job_nearby')}</h2>
      </div>
      <div className="mt-4 rounded-2xl border border-line p-3.5">
        <div className="flex items-center gap-3">
          <CategoryIcon icon={cat?.icon} boxed />
          <div className="min-w-0 text-left">
            <p className="truncate font-bold">{job.title}</p>
            <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="size-3" />
              {data.kind === 'quick' ? `${km(data.job.distance_km)} · ` : ''}{job.area}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div><Users className="mx-auto mb-0.5 size-4 text-muted" /><b>{t('slots_available', { n: slotsLeft })}</b></div>
          <div><Clock className="mx-auto mb-0.5 size-4 text-muted" /><b>{duration(job.duration_minutes, lang)}</b></div>
          <div><IndianRupee className="mx-auto mb-0.5 size-4 text-muted" /><b>{rupees(pay)}</b> {t('per_worker')}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line p-3">
        <Avatar name={data.kind === 'request' ? data.customer : data.job.customer_name} size={40} />
        <div className="flex-1 text-left">
          <p className="text-xs text-muted">{t('customer')}</p>
          <p className="font-semibold">{data.kind === 'request' ? data.customer : data.job.customer_name}</p>
        </div>
        <ChevronRight className="size-4 text-muted" />
      </div>
      {data.kind === 'request' && data.booking.expires_at && (
        <p className="mt-3 text-center text-sm text-muted">⏱ {elapsed(new Date(now).toISOString(), new Date(data.booking.expires_at).getTime()).slice(3)}</p>
      )}
      {error && <Alert tone="red" className="mt-3">{error}</Alert>}
      <div className="mt-4 space-y-2">
        <Button size="lg" full loading={busy === 'accept'} onClick={accept}>{t('accept_job')}</Button>
        <Button variant="outline" full loading={busy === 'decline'} onClick={decline}>{t('decline')}</Button>
      </div>
      <p className="sr-only">{catName(cat)}</p>
    </Modal>
  );
}
