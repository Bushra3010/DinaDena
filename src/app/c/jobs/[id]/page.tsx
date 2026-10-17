'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  CircleCheck, Clock, IndianRupee, KeyRound, MapPin, MessageSquare, Phone, RotateCcw, Search, ShieldCheck,
  Timer, TriangleAlert, Users,
} from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ComplaintButton } from '@/components/ComplaintButton';
import { MapView, type MapMarker } from '@/components/Map';
import {
  Alert, Avatar, Badge, Button, Card, Empty, KeyValue, LinkButton, Modal, PageLoader, RatingInput, SectionTitle,
  Stars, StatusPill, Textarea, TopBar,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateOnly, dateTime, duration, elapsed, openExternal, rupees, timeOnly } from '@/lib/format';
import { distanceKm } from '@/lib/geo';
import { useCategories, useLoad, useRealtime, useSettings, useTick } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc, supabase } from '@/lib/supabase';
import type { Booking, Job, Payment, Review, WorkerLocation } from '@/lib/types';

type WorkerInfo = { full_name: string | null; avatar_url: string | null; rating_avg: number; rating_count: number };
const ENDED = ['rejected', 'expired', 'cancelled'];
const LIVE = ['requested', 'accepted', 'on_the_way', 'in_progress'];

export default function CustomerJob() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { t, lang, catName } = useI18n();
  const router = useRouter();
  const categories = useCategories();
  const settings = useSettings();
  const [otps, setOtps] = useState<Record<string, { otp: string; kind: 'in' | 'out' }>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, reload } = useLoad(async () => {
    await rpc('expire_stale_requests').catch(() => undefined);
    const [{ data: job }, { data: bookings }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
      supabase.from('bookings').select('*').eq('job_id', id).order('created_at'),
    ]);
    const bs = (bookings ?? []) as Booking[];
    const workerIds = bs.map((b) => b.worker_id);
    const bookingIds = bs.map((b) => b.id);
    const [{ data: names }, { data: cards }, { data: locs }, { data: pays }, { data: reviews }] = await Promise.all([
      supabase.from('public_profiles').select('id, full_name, avatar_url').in('id', workerIds),
      supabase.from('worker_profiles').select('user_id, rating_avg, rating_count').in('user_id', workerIds),
      supabase.from('worker_locations').select('*').in('booking_id', bookingIds).order('recorded_at', { ascending: false }).limit(100),
      supabase.from('payments').select('*').eq('job_id', id).order('created_at', { ascending: false }),
      supabase.from('reviews').select('*').in('booking_id', bookingIds).eq('from_user', profile!.id),
    ]);
    const workers: Record<string, WorkerInfo> = {};
    for (const w of workerIds) {
      const n = names?.find((x) => x.id === w);
      const c = cards?.find((x) => x.user_id === w);
      workers[w] = { full_name: n?.full_name ?? null, avatar_url: n?.avatar_url ?? null, rating_avg: c?.rating_avg ?? 0, rating_count: c?.rating_count ?? 0 };
    }
    const latest: Record<string, WorkerLocation> = {};
    for (const l of (locs ?? []) as WorkerLocation[]) latest[l.booking_id] ??= l;
    return {
      job: job as Job | null, bookings: bs, workers, latest,
      payments: (pays ?? []) as Payment[], reviews: (reviews ?? []) as Review[],
    };
  }, [id]);

  const bookingIds = data?.bookings.map((b) => b.id).join(',') ?? '';
  useRealtime('bookings', `job_id=eq.${id}`, reload);
  useRealtime('jobs', `id=eq.${id}`, reload);
  useRealtime('worker_locations', bookingIds ? `booking_id=in.(${bookingIds})` : null, reload, !!bookingIds);

  const live = data?.bookings.some((b) => b.status === 'in_progress');
  const now = useTick(1000, !!live || data?.bookings.some((b) => b.status === 'requested'));

  if (loading && !data) return <PageLoader />;
  if (!data?.job) return <><TopBar title="" back="/c" /><Empty title={t('something_wrong')} /></>;

  const { job, bookings, workers, latest, payments, reviews } = data;
  const cat = categories.find((c) => c.id === job.category_id);
  const active = bookings.filter((b) => !ENDED.includes(b.status));
  const confirmed = active.filter((b) => b.status !== 'requested');
  const anyLive = bookings.some((b) => LIVE.includes(b.status));
  const started = bookings.some((b) => ['on_the_way', 'in_progress', 'completed'].includes(b.status));
  const completed = bookings.filter((b) => b.status === 'completed');
  const unpaid = completed.filter((b) => !b.paid_at);
  const allDone = !anyLive && completed.length > 0;
  const moving = bookings.filter((b) => b.status === 'on_the_way' || b.status === 'in_progress');
  const pendingRequest = job.job_type === 'daily' ? bookings.find((b) => b.status === 'requested') : undefined;
  const directEnded = job.job_type === 'daily' && bookings.length > 0 && bookings.every((b) => ENDED.includes(b.status));
  const firstCheckIn = bookings.filter((b) => b.check_in_at && b.status === 'in_progress').map((b) => b.check_in_at!).sort()[0];

  const title = job.status === 'cancelled' ? job.code
    : allDone ? t('complete_job')
      : bookings.some((b) => b.status === 'in_progress') ? t('active_job')
        : moving.length ? t('workers_on_the_way') : t('request_live');

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

  const showOtp = (b: Booking) => act(`otp-${b.id}`, async () => {
    const r = await rpc<{ otp: string; kind: 'in' | 'out' }>('issue_attendance_otp', { p_booking: b.id });
    setOtps((o) => ({ ...o, [b.id]: r }));
  });

  const contact = (b: Booking, scheme: 'tel' | 'sms') => act(`${scheme}-${b.id}`, async () => {
    const phone = await rpc<string | null>('get_contact_phone', { p_booking: b.id });
    if (phone) openExternal(`${scheme}:+${phone}`);
  });

  const markers: MapMarker[] = [
    { id: 'job', lat: job.lat, lng: job.lng, kind: 'job', tooltip: t('your_location') },
    ...moving.filter((b) => latest[b.id]).map((b) => ({
      id: b.id, lat: latest[b.id]!.lat, lng: latest[b.id]!.lng, kind: 'worker' as const,
      label: (workers[b.worker_id]?.full_name ?? '?').split(' ').map((s) => s[0]).join('').slice(0, 2),
      tooltip: workers[b.worker_id]?.full_name ?? '', permanent: true,
    })),
  ];

  const totalEstimate = (job.rate_per_worker + job.platform_fee) * job.workers_needed;

  return (
    <div className="pb-8">
      <TopBar title={title} back="/c" sub={`${job.code} · ${catName(cat)}`} right={
        <Link href="/c/bookings" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand-600">{t('help')}</Link>
      } />
      <div className="space-y-4 p-4">
        {error && <Alert tone="red" icon={<TriangleAlert className="size-4" />}>{error}</Alert>}

        {job.status === 'cancelled' && !directEnded && (
          <Alert tone="amber" title={t('job_cancelled')}>
            <LinkButton href={`/c/post?rebook=${job.id}`} size="sm" variant="outline" className="mt-2" icon={<RotateCcw className="size-4" />}>{t('rebook')}</LinkButton>
          </Alert>
        )}

        {directEnded && (
          <Alert tone="amber" title={bookings.some((b) => b.status === 'rejected') ? t('booking_rejected') : bookings.some((b) => b.status === 'expired') ? t('booking_expired') : t('job_cancelled')}>
            <LinkButton href={`/c/workers?category=${job.category_id}`} size="sm" className="mt-2" icon={<Search className="size-4" />}>{t('find_another')}</LinkButton>
          </Alert>
        )}

        {pendingRequest && (
          <Card className="p-5 text-center">
            <Radar />
            <p className="mt-3 font-bold">{t('waiting_response', { name: workers[pendingRequest.worker_id]?.full_name ?? '' })}</p>
            <p className="text-sm text-muted">{t('respond_within', { n: settings?.request_timeout_minutes ?? 10 })}</p>
            {pendingRequest.expires_at && (
              <p className="mt-2 text-2xl font-bold tabular-nums text-brand-600">
                {elapsed(new Date(now).toISOString(), new Date(pendingRequest.expires_at).getTime()).slice(3)}
              </p>
            )}
          </Card>
        )}

        {job.job_type === 'quick' && job.status === 'open' && (
          <Card className="overflow-hidden">
            <div className="flex flex-col items-center bg-gradient-to-b from-brand-50 to-white px-5 py-6 text-center">
              <Radar />
              <p className="mt-4 text-lg font-bold">{t('finding_workers')}</p>
              <p className="text-sm text-muted">{t('finding_sub', { km: settings?.search_radius_km ?? 10 })}</p>
              <div className="mt-4 w-full">
                <div className="mb-1.5 flex justify-between text-sm font-semibold">
                  <span>{t('workers_accepted', { n: confirmed.length, m: job.workers_needed })}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(confirmed.length / job.workers_needed) * 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">{t('notifying_workers')}</p>
              </div>
            </div>
          </Card>
        )}

        {job.job_type === 'quick' && confirmed.length > 0 && !allDone && (
          <Alert tone="green" icon={<CircleCheck className="size-5" />}
            title={confirmed.length >= job.workers_needed ? t('all_confirmed') : t('workers_confirmed', { n: confirmed.length, m: job.workers_needed })} />
        )}

        {moving.length > 0 && (
          <MapView className="h-56" center={{ lat: job.lat, lng: job.lng }} markers={markers}
            route={moving.length === 1 && latest[moving[0]!.id] ? [latest[moving[0]!.id]!, { lat: job.lat, lng: job.lng }] : undefined} />
        )}

        {firstCheckIn && (
          <Card className="flex items-center gap-4 p-4">
            <Timer className="size-8 text-brand-500" />
            <div className="flex-1">
              <p className="text-sm text-muted">{t('elapsed_time')}</p>
              <p className="text-2xl font-bold tabular-nums">{elapsed(firstCheckIn, now)}</p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted">{t('estimated_time')}</p>
              <p className="font-semibold">{duration(job.duration_minutes, lang)}</p>
            </div>
          </Card>
        )}

        {active.length > 0 && !allDone && (
          <section className="space-y-3">
            {active.map((b) => {
              const w = workers[b.worker_id];
              const loc = latest[b.id];
              const eta = b.status === 'on_the_way' && loc ? Math.max(1, Math.round((distanceKm(loc, job) / 18) * 60)) : null;
              // An OTP stays on screen only until the worker has used it.
              const otp = otps[b.id] && (otps[b.id]!.kind === 'out') === (b.status === 'in_progress') ? otps[b.id] : undefined;
              const needsOtp = ['accepted', 'on_the_way', 'in_progress'].includes(b.status);
              return (
                <Card key={b.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={w?.full_name} url={w?.avatar_url} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{w?.full_name}</p>
                      <div className="flex items-center gap-2"><Stars value={w?.rating_avg ?? 0} count={w?.rating_count} /></div>
                      {eta && <p className="text-xs font-semibold text-violet-700">{t('eta_min', { n: eta })} · {distanceKm(loc!, job).toFixed(1)} km</p>}
                      {b.status === 'in_progress' && b.check_in_at && (
                        <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck className="size-3.5" />{t('work_started')} · {timeOnly(b.check_in_at, lang)}</p>
                      )}
                    </div>
                    <StatusPill status={b.status} />
                  </div>
                  {b.status !== 'requested' && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" loading={busy === `sms-${b.id}`} icon={<MessageSquare className="size-4" />} onClick={() => contact(b, 'sms')}>{t('message')}</Button>
                      <Button variant="outline" size="sm" loading={busy === `tel-${b.id}`} icon={<Phone className="size-4" />} onClick={() => contact(b, 'tel')}>{t('call')}</Button>
                    </div>
                  )}
                  {b.extra_minutes_requested > 0 && (
                    <div className="mt-3 rounded-xl bg-sky-50 p-3 text-sm">
                      <p className="font-semibold text-sky-900">{t('extra_time_ask', {
                        name: w?.full_name?.split(' ')[0] ?? '', n: b.extra_minutes_requested,
                        amount: rupees(Math.ceil(((cat?.hourly_rate ?? 0) * b.extra_minutes_requested) / 60)),
                      })}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Button size="sm" variant="success" loading={busy === `x-${b.id}`} onClick={() => act(`x-${b.id}`, () => rpc('respond_extra_time', { p_booking: b.id, p_approve: true }))}>{t('approve')}</Button>
                        <Button size="sm" variant="danger" onClick={() => act(`x-${b.id}`, () => rpc('respond_extra_time', { p_booking: b.id, p_approve: false }))}>{t('reject')}</Button>
                      </div>
                    </div>
                  )}
                  {needsOtp && (
                    <div className="mt-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 p-3">
                      {otp ? (
                        <div className="text-center">
                          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{otp.kind === 'in' ? t('start_otp') : t('end_otp')}</p>
                          <p className="my-1 text-4xl font-black tracking-[0.4em] tabular-nums text-ink" aria-live="polite">{otp.otp}</p>
                          <p className="text-xs text-muted">{t(otp.kind === 'in' ? 'share_otp_start' : 'share_otp_end', { name: w?.full_name?.split(' ')[0] ?? '' })}</p>
                          <button type="button" className="mt-1 text-xs font-semibold text-brand-600" onClick={() => showOtp(b)}>{t('new_otp')}</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <KeyRound className="size-5 text-brand-600" />
                          <p className="flex-1 text-sm font-semibold">{b.status === 'in_progress' ? t('end_otp') : t('start_otp')}</p>
                          <Button size="sm" loading={busy === `otp-${b.id}`} onClick={() => showOtp(b)}>{t('show_otp')}</Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
            {job.job_type === 'quick' && job.status === 'open' && confirmed.length > 0 && (
              <Card className="flex items-center gap-3 border-dashed p-4 text-sm text-muted">
                <Users className="size-5" /> {t('searching_another')}
              </Card>
            )}
          </section>
        )}

        {allDone && unpaid.length > 0 && (
          <PayCard job={job} bookings={completed} workers={workers} />
        )}

        {allDone && unpaid.length === 0 && (
          <PaidSection job={job} bookings={completed} workers={workers} payments={payments} reviews={reviews} onReviewed={reload} />
        )}

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <CategoryIcon icon={cat?.icon} boxed />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{job.title}</p>
              {job.description && <p className="text-sm text-muted">{job.description}</p>}
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-sm">
            <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" />{job.address}</p>
            <p className="flex items-center gap-2"><Clock className="size-4 text-muted" />{dateTime(job.start_at, lang)} · {duration(job.duration_minutes, lang)}</p>
            <p className="flex items-center gap-2"><Users className="size-4 text-muted" />{job.workers_needed} {job.workers_needed > 1 ? t('workers') : t('worker')}</p>
          </div>
          {!allDone && (
            <div className="mt-3 border-t border-line pt-3">
              <KeyValue k={`${t('labour_amount')} (${job.workers_needed} × ${rupees(job.rate_per_worker)})`} v={rupees(job.rate_per_worker * job.workers_needed)} />
              <KeyValue k={t('platform_fee')} v={rupees(job.platform_fee * job.workers_needed)} />
              <KeyValue strong k={t('total_amount')} v={rupees(totalEstimate)} />
            </div>
          )}
        </Card>

        {!started && ['open', 'booked'].includes(job.status) && (
          <Button variant="danger" full onClick={() => setCancelOpen(true)}>{t('cancel_request')}</Button>
        )}
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={t('cancel_confirm')}>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setCancelOpen(false)}>{t('back')}</Button>
          <Button variant="dark" loading={busy === 'cancel'} onClick={() => act('cancel', async () => {
            await rpc('cancel_job', { p_job: job.id });
            setCancelOpen(false);
            router.replace('/c');
          })}>{t('cancel_request')}</Button>
        </div>
      </Modal>
    </div>
  );
}

function Radar() {
  return (
    <div className="relative flex size-28 items-center justify-center">
      <span className="radar-ring absolute size-full rounded-full bg-brand-400/40" />
      <span className="radar-ring absolute size-full rounded-full bg-brand-400/40 [animation-delay:1.2s]" />
      <span className="relative flex size-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40">
        <Search className="size-6" />
      </span>
    </div>
  );
}

function workedMinutes(b: Booking) {
  if (!b.check_in_at || !b.check_out_at) return 0;
  return Math.max(1, Math.round((new Date(b.check_out_at).getTime() - new Date(b.check_in_at).getTime()) / 60000));
}

function PayCard({ job, bookings, workers }: { job: Job; bookings: Booking[]; workers: Record<string, WorkerInfo> }) {
  const { t, lang } = useI18n();
  const unpaid = bookings.filter((b) => !b.paid_at);
  const labour = unpaid.reduce((s, b) => s + b.amount, 0);
  const fees = unpaid.reduce((s, b) => s + b.platform_fee, 0);
  return (
    <>
      <Alert tone="green" icon={<CircleCheck className="size-5" />} title={t('job_completed')}>{t('job_completed_sub')}</Alert>
      <Card className="p-4">
        <SectionTitle>{t('workers_and_hours')}</SectionTitle>
        <ul className="space-y-2.5">
          {unpaid.map((b) => (
            <li key={b.id} className="flex items-center gap-3">
              <Avatar name={workers[b.worker_id]?.full_name} size={36} />
              <span className="flex-1 text-sm font-semibold">{workers[b.worker_id]?.full_name}</span>
              <span className="text-sm text-muted">{duration(Math.max(job.duration_minutes, workedMinutes(b)), lang)}</span>
              <span className="w-16 text-right text-sm font-semibold">{rupees(b.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-line pt-3">
          <SectionTitle>{t('billing')}</SectionTitle>
          <KeyValue k={t('labour_amount')} v={rupees(labour)} />
          <KeyValue k={t('platform_fee')} v={rupees(fees)} />
          <KeyValue strong k={t('total_amount')} v={rupees(labour + fees)} />
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <SectionTitle>{t('payment_method')}</SectionTitle>
          <div className="flex items-center gap-3 rounded-xl border-2 border-brand-500 bg-brand-50 p-3">
            <IndianRupee className="size-5 text-brand-600" />
            <span className="flex-1 text-sm font-semibold">{t('upi_recommended')}</span>
            <CircleCheck className="size-5 text-brand-500" />
          </div>
        </div>
      </Card>
      <LinkButton href={`/c/jobs/${job.id}/pay`} size="lg" full>{t('pay_amount', { amount: rupees(labour + fees) })}</LinkButton>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3.5" />{t('secure_payment')}</p>
    </>
  );
}

function PaidSection({ job, bookings, workers, payments, reviews, onReviewed }: {
  job: Job; bookings: Booking[]; workers: Record<string, WorkerInfo>; payments: Payment[]; reviews: Review[]; onReviewed: () => void;
}) {
  const { t, lang } = useI18n();
  const ok = payments.filter((p) => p.status === 'success' || p.status === 'refunded');
  const total = ok.reduce((s, p) => s + p.amount, 0);
  const ref = ok[0];
  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 bg-emerald-50 p-4">
          <CircleCheck className="size-8 text-emerald-600" />
          <div className="flex-1">
            <p className="font-bold text-emerald-900">{t('payment_success')}</p>
            <p className="text-sm text-emerald-800">{rupees(total)} · UPI</p>
          </div>
          {ok.some((p) => p.status === 'refunded') && <Badge tone="gray">Refunded</Badge>}
        </div>
        <div className="p-4">
          <SectionTitle>{t('receipt')}</SectionTitle>
          {bookings.map((b) => (
            <KeyValue key={b.id} k={`${workers[b.worker_id]?.full_name} · ${duration(Math.max(job.duration_minutes, workedMinutes(b)), lang)}`} v={rupees(b.amount)} />
          ))}
          <KeyValue k={t('platform_fee')} v={rupees(bookings.reduce((s, b) => s + b.platform_fee, 0))} />
          <div className="my-1.5 border-t border-line" />
          <KeyValue strong k={t('total_amount')} v={rupees(total)} />
          {ref && (
            <div className="mt-2 space-y-0.5 text-xs text-muted">
              <p>{t('payment_ref')}: <span className="font-mono">{ref.gateway_payment_id}</span></p>
              <p>{t('order_id')}: <span className="font-mono">{ref.gateway_order_id}</span></p>
              <p>{t('paid_on')}: {dateOnly(ref.created_at, lang)} {timeOnly(ref.created_at, lang)}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>{bookings.length > 1 ? t('rate_workers') : t('rate_worker')}</SectionTitle>
        <div className="space-y-4">
          {bookings.map((b) => (
            <ReviewForm key={b.id} booking={b} name={workers[b.worker_id]?.full_name ?? ''}
              existing={reviews.find((r) => r.booking_id === b.id)} onDone={onReviewed} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <LinkButton href={`/c/post?rebook=${job.id}`} variant="outline" icon={<RotateCcw className="size-4" />}>{t('rebook')}</LinkButton>
        <ComplaintButton jobId={job.id} bookingId={bookings[0]?.id} />
      </div>
    </>
  );
}

function ReviewForm({ booking, name, existing, onDone }: { booking: Booking; name: string; existing?: Review; onDone: () => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existing) {
    return (
      <div className="flex items-center gap-3">
        <Avatar name={name} size={36} />
        <span className="flex-1 text-sm font-semibold">{name}</span>
        <Stars value={existing.rating} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Avatar name={name} size={36} />
        <span className="flex-1 text-sm font-semibold">{name}</span>
      </div>
      <RatingInput value={rating} onChange={setRating} />
      {rating > 0 && (
        <>
          <Textarea aria-label={t('write_review')} placeholder={t('write_review')} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button size="sm" loading={busy} onClick={async () => {
            setBusy(true);
            try {
              await rpc('submit_review', { p_booking: booking.id, p_rating: rating, p_comment: comment });
              onDone();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}>{t('submit_review')}</Button>
        </>
      )}
    </div>
  );
}
