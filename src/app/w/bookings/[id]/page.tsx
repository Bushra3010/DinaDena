'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  CircleCheck, Clock, IndianRupee, MapPin, MessageSquare, Navigation, Phone, ShieldCheck,
  Timer, TriangleAlert, Wallet,
} from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ComplaintButton } from '@/components/ComplaintButton';
import { MapView } from '@/components/Map';
import {
  Alert, Avatar, Button, Card, Empty, KeyValue, LinkButton, OtpBoxes, PageLoader, RatingInput, SectionTitle, Stars,
  StatusPill, Textarea, TopBar,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateOnly, dateTime, duration, elapsed, openExternal, rupees, timeOnly } from '@/lib/format';
import { distanceKm } from '@/lib/geo';
import { useCategories, useLoad, useRealtime, useTick } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc, supabase } from '@/lib/supabase';
import type { Booking, Job, LedgerEntry, Review, WorkerLocation } from '@/lib/types';

const EXTRA_MIN = 30;

export default function WorkerBooking() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const categories = useCategories();
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, reload } = useLoad(async () => {
    const { data: b } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
    if (!b) return null;
    const booking = b as Booking;
    const [{ data: job }, { data: mates }, { data: cust }, { data: loc }, { data: ledger }, { data: review }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', booking.job_id).single(),
      supabase.from('bookings').select('id, worker_id, status').eq('job_id', booking.job_id),
      supabase.from('public_profiles').select('full_name, avatar_url').eq('id', booking.customer_id).maybeSingle(),
      supabase.from('worker_locations').select('*').eq('booking_id', id).order('recorded_at', { ascending: false }).limit(1),
      supabase.from('wallet_ledger').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('reviews').select('*').eq('booking_id', id).eq('from_user', profile!.id).maybeSingle(),
    ]);
    return {
      booking, job: job as Job, mates: (mates ?? []) as Pick<Booking, 'id' | 'worker_id' | 'status'>[],
      customer: cust, loc: (loc?.[0] ?? null) as WorkerLocation | null, ledger: (ledger ?? []) as LedgerEntry[],
      review: review as Review | null,
    };
  }, [id]);
  useRealtime('bookings', `id=eq.${id}`, reload);
  useRealtime('worker_locations', `booking_id=eq.${id}`, reload);
  const b = data?.booking;
  const now = useTick(1000, b?.status === 'in_progress');

  if (loading && !data) return <PageLoader />;
  if (!data || !b) return <><TopBar title="" back="/w" /><Empty title={t('something_wrong')} /></>;

  const { job, mates, customer, loc, ledger, review } = data;
  const cat = categories.find((c) => c.id === job.category_id);
  const filled = mates.filter((m) => ['accepted', 'on_the_way', 'in_progress', 'completed'].includes(m.status)).length;
  const arrived = loc ? distanceKm(loc, job) < 0.25 : false;

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const call = (scheme: 'tel' | 'sms') => act(scheme, async () => {
    const phone = await rpc<string | null>('get_contact_phone', { p_booking: id });
    if (phone) openExternal(`${scheme}:+${phone}`);
  });

  const verifyOtp = () => act('otp', async () => {
    const r = await rpc<{ ok: boolean; error?: string; attempts_left?: number; locked_until?: string }>('verify_attendance_otp', {
      p_booking: id, p_otp: otp, p_lat: loc?.lat ?? null, p_lng: loc?.lng ?? null,
    });
    setOtp('');
    if (!r.ok) {
      if (r.error === 'wrong_otp') throw new Error(t('wrong_otp', { n: r.attempts_left ?? 0 }));
      if (r.error === 'locked') throw new Error(t('otp_locked', { time: timeOnly(r.locked_until!, lang) }));
      if (r.error === 'otp_not_issued') throw new Error(b.status === 'in_progress' ? t('share_otp_end', { name: '' }) : t('share_otp_start', { name: '' }));
      throw new Error(r.error);
    }
  });

  const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`;
  const title = b.status === 'completed' ? t('job_completed_w')
    : b.status === 'in_progress' ? t('active_work')
      : b.status === 'on_the_way' ? t('check_in_at_location') : job.title;

  const customerCard = (
    <Card className="flex items-center gap-3 p-3.5">
      <Avatar name={customer?.full_name} url={customer?.avatar_url} size={44} />
      <div className="flex-1">
        <p className="text-xs text-muted">{t('customer')}</p>
        <p className="font-semibold">{customer?.full_name}</p>
      </div>
      {['accepted', 'on_the_way', 'in_progress'].includes(b.status) && (
        <>
          <Button variant="outline" size="sm" aria-label={t('call')} loading={busy === 'tel'} onClick={() => call('tel')}><Phone className="size-4" /></Button>
          <Button variant="outline" size="sm" aria-label={t('message')} loading={busy === 'sms'} onClick={() => call('sms')}><MessageSquare className="size-4" /></Button>
        </>
      )}
    </Card>
  );

  const jobCard = (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <CategoryIcon icon={cat?.icon} boxed />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{job.title}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-brand-500">{rupees(b.amount)} <span className="text-sm font-normal text-muted">{t('per_worker')}</span></p>
        </div>
        <StatusPill status={b.status} />
      </div>
      {job.description && <p className="mt-2 text-sm text-muted">{job.description}</p>}
      <div className="mt-3 space-y-1.5 text-sm">
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" />{job.address}</p>
        <p className="flex items-center gap-2"><Clock className="size-4 text-muted" />{dateTime(job.start_at, lang)} · {duration(job.duration_minutes, lang)}</p>
        <p className="flex items-center gap-2"><IndianRupee className="size-4 text-muted" />{rupees(b.amount)} {t('per_worker')}</p>
      </div>
    </Card>
  );

  return (
    <div className="pb-8">
      <TopBar title={title} back="/w" sub={job.code} />
      <div className="space-y-4 p-4">
        {error && <Alert tone="red" icon={<TriangleAlert className="size-4" />}>{error}</Alert>}

        {['rejected', 'expired', 'cancelled'].includes(b.status) && (
          <Alert tone="amber" title={t(b.status === 'cancelled' ? 'job_cancelled' : b.status === 'expired' ? 'booking_expired' : 'booking_rejected')} />
        )}

        {b.status === 'requested' && (
          <>
            {jobCard}
            {customerCard}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" loading={busy === 'decline'} onClick={() => act('decline', () => rpc('respond_booking', { p_booking: id, p_accept: false }))}>{t('decline')}</Button>
              <Button size="lg" loading={busy === 'accept'} onClick={() => act('accept', () => rpc('respond_booking', { p_booking: id, p_accept: true }))}>{t('accept_job')}</Button>
            </div>
          </>
        )}

        {b.status === 'accepted' && (
          <>
            <div className="flex flex-col items-center py-2 text-center">
              <CircleCheck className="size-16 text-emerald-500" />
              <h2 className="mt-2 text-xl font-extrabold text-emerald-700">{t('your_spot_confirmed')}</h2>
              {job.workers_needed > 1 && <p className="text-sm text-muted">{t('slots_filled', { n: filled, m: job.workers_needed })}</p>}
            </div>
            {job.workers_needed > 1 && (
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(filled / job.workers_needed) * 100}%` }} />
              </div>
            )}
            {jobCard}
            {customerCard}
            <div className="grid grid-cols-2 gap-2">
              <a href={navigateUrl} target="_blank" rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
                <Navigation className="size-4" />{t('navigate')}
              </a>
              <Button variant="outline" icon={<Phone className="size-4" />} loading={busy === 'tel'} onClick={() => call('tel')}>{t('call_customer')}</Button>
            </div>
            <Button size="lg" full variant="dark" loading={busy === 'trip'} onClick={() => act('trip', () => rpc('start_trip', { p_booking: id }))}>{t('start_trip')}</Button>
          </>
        )}

        {b.status === 'on_the_way' && (
          <>
            <MapView className="h-52" center={job} markers={[
              { id: 'job', lat: job.lat, lng: job.lng, kind: 'job' },
              ...(loc ? [{ id: 'me', lat: loc.lat, lng: loc.lng, kind: 'me' as const }] : []),
            ]} route={loc ? [loc, job] : undefined} />
            {arrived ? (
              <Alert tone="green" icon={<CircleCheck className="size-4" />}>{t('you_have_arrived')}</Alert>
            ) : (
              <Alert tone="blue" icon={<Navigation className="size-4" />}>
                {loc ? `${distanceKm(loc, job).toFixed(1)} km · ` : ''}{t('sharing_location')}
              </Alert>
            )}
            <Card className="flex items-start gap-2 p-3.5 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-brand-500" />{job.address}</Card>
            <p className="flex items-start gap-2 rounded-2xl bg-sky-50 p-3 text-xs text-sky-900"><ShieldCheck className="size-4 shrink-0" />{t('location_privacy')}</p>
            <OtpCard label={t('enter_start_otp')} otp={otp} setOtp={setOtp} busy={busy === 'otp'} onSubmit={verifyOtp} cta={t('check_in_start')} />
            {customerCard}
          </>
        )}

        {b.status === 'in_progress' && (
          <>
            {jobCard}
            <Card className="worker-timer p-5">
              <p className="mb-2 font-bold">{t('work_in_progress')}</p>
              <div className="flex items-center gap-4">
                <Timer className="size-9 text-brand-600" />
                <div className="flex-1">
                  <p className="text-xs text-muted">{t('elapsed_time')}</p>
                  <p className="text-5xl font-bold tracking-tight tabular-nums">{elapsed(b.check_in_at!, now)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">{t('estimated_time')}</p>
                  <p className="font-bold">{duration(job.duration_minutes + b.extra_minutes_approved, lang)}</p>
                </div>
              </div>
            </Card>
            {customerCard}
            <Card className="flex items-center gap-3 p-4"><Wallet className="size-12 rounded-full bg-brand-50 p-3 text-brand-500" /><div><p className="text-sm font-bold">{lang === 'hi' ? 'अनुमानित कमाई' : 'Expected earnings'}</p><p className="mt-1 text-3xl font-bold text-brand-500">{rupees(b.amount)} <span className="text-sm font-normal text-muted">{t('per_worker')}</span></p></div></Card>
            <Card className="border-brand-200 bg-brand-50 p-4">
              <p className="font-bold text-sky-900">{t('need_more_time')}</p>
              {b.extra_minutes_requested > 0 ? (
                <p className="mt-1 text-sm text-sky-900">{t('extra_pending', { n: b.extra_minutes_requested })}</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-sky-900">{t('extra_time_hint', { n: EXTRA_MIN, amount: rupees(Math.ceil(((cat?.hourly_rate ?? 0) * EXTRA_MIN) / 60)) })}</p>
                  <Button variant="outline" size="sm" full className="mt-3 border-sky-300 text-sky-800" loading={busy === 'extra'}
                    onClick={() => act('extra', () => rpc('request_extra_time', { p_booking: id, p_minutes: EXTRA_MIN }))}>
                    {t('request_extra', { n: EXTRA_MIN })}
                  </Button>
                </>
              )}
              {b.extra_minutes_approved > 0 && <p className="mt-2 text-sm font-semibold text-emerald-700">{t('extra_approved', { n: b.extra_minutes_approved })}</p>}
            </Card>
            <OtpCard label={t('enter_end_otp')} otp={otp} setOtp={setOtp} busy={busy === 'otp'} onSubmit={verifyOtp} cta={t('end_work')} danger />
          </>
        )}

        {b.status === 'completed' && (
          <>
            <div className="flex flex-col items-center py-2 text-center">
              <CircleCheck className="size-16 text-emerald-500" />
              <h2 className="mt-2 text-xl font-extrabold text-emerald-700">{t('work_completed')}</h2>
              <p className="text-sm text-muted">{t('thank_you_work')}</p>
            </div>
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted">{t('base_payment')}</p><p className="text-lg font-bold">{rupees(job.rate_per_worker)}</p></div>
                <div><p className="text-xs text-muted">{t('overtime_payment')}</p><p className="text-lg font-bold">{rupees(Math.max(0, b.amount - job.rate_per_worker))}</p></div>
              </div>
              <div className="mt-3 border-t border-line pt-3"><KeyValue strong k={t('total_earned')} v={rupees(b.amount)} /></div>
            </Card>
            {b.paid_at
              ? <Alert tone="green" icon={<CircleCheck className="size-5" />} title={t('payment_received')}>{dateOnly(b.paid_at, lang)} {timeOnly(b.paid_at, lang)}</Alert>
              : <Alert tone="amber" icon={<Clock className="size-5" />} title={t('payout_pending')}>{t('payout_pending_sub')}</Alert>}
            <RateCustomer bookingId={id} existing={review} name={customer?.full_name ?? ''} onDone={reload} />
            <Card className="p-4">
              <SectionTitle action={<LinkButton href="/w/earnings" variant="ghost" size="sm">{t('view_all')}</LinkButton>}>{t('recent_transactions')}</SectionTitle>
              {ledger.map((l) => <KeyValue key={l.id} k={dateOnly(l.created_at, lang)} v={<span className={l.amount < 0 ? 'text-red-600' : 'text-emerald-700'}>{rupees(l.amount)}</span>} />)}
            </Card>
            <ComplaintButton jobId={job.id} bookingId={id} label={t('report_issue')} variant="danger" />
          </>
        )}
      </div>
    </div>
  );
}

function OtpCard({ label, otp, setOtp, busy, onSubmit, cta, danger }: {
  label: string; otp: string; setOtp: (v: string) => void; busy: boolean; onSubmit: () => void; cta: string; danger?: boolean;
}) {
  return (
    <Card className="space-y-4 p-4">
      <p className="text-center font-bold">{label}</p>
      <OtpBoxes length={4} value={otp} onChange={setOtp} />
      <Button size="lg" full variant={danger ? 'danger' : 'primary'} loading={busy} disabled={otp.length !== 4} onClick={onSubmit}>{cta}</Button>
    </Card>
  );
}

function RateCustomer({ bookingId, existing, name, onDone }: { bookingId: string; existing: Review | null; name: string; onDone: () => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="p-4">
      <SectionTitle>{t('your_rating')} · {name}</SectionTitle>
      {existing ? <Stars value={existing.rating} /> : (
        <div className="space-y-2">
          <RatingInput value={rating} onChange={setRating} />
          {rating > 0 && (
            <>
              <Textarea aria-label={t('write_review')} placeholder={t('write_review')} value={comment} onChange={(e) => setComment(e.target.value)} />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button size="sm" loading={busy} onClick={async () => {
                setBusy(true);
                try {
                  await rpc('submit_review', { p_booking: bookingId, p_rating: rating, p_comment: comment });
                  onDone();
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}>{t('submit_review')}</Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
