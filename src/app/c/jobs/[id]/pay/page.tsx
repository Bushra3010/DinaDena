'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CircleCheck, CircleX, IndianRupee, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { Alert, Button, Card, cx, KeyValue, PageLoader, Spinner, TopBar } from '@/components/ui';
import { dateOnly, rupees, timeOnly } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { rpc, supabase } from '@/lib/supabase';
import type { Booking, Job } from '@/lib/types';

type Result = { success: boolean; amount: number; payment_ref: string; order_id: string; paid_at: string };

// Dummy UPI gateway. The database function decides the amount and marks bookings paid;
// Razorpay replaces this screen later without changing that rule.
export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [method, setMethod] = useState<'upi' | 'qr'>('upi');
  const [stage, setStage] = useState<'choose' | 'processing' | 'done'>('choose');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useLoad(async () => {
    const [{ data: job }, { data: bookings }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('bookings').select('*').eq('job_id', id).eq('status', 'completed').is('paid_at', null),
    ]);
    return { job: job as Job, bookings: (bookings ?? []) as Booking[] };
  }, [id]);

  if (loading || !data) return <PageLoader />;
  const due = data.bookings.reduce((s, b) => s + b.amount + b.platform_fee, 0);

  async function pay(success: boolean) {
    setStage('processing');
    setError(null);
    await new Promise((r) => setTimeout(r, 1400));
    try {
      const r = await rpc<Result>('mock_pay_job', { p_job: id, p_success: success });
      setResult(r);
      setStage('done');
    } catch (e) {
      setError((e as Error).message);
      setStage('choose');
    }
  }

  if (stage === 'done' && result) {
    return (
      <div className="flex min-h-dvh flex-col bg-white">
        <div className="flex flex-1 flex-col items-center px-6 pt-16 text-center">
          {result.success ? <CircleCheck className="size-20 text-emerald-500" /> : <CircleX className="size-20 text-red-500" />}
          <h1 className="mt-4 text-2xl font-extrabold">{result.success ? t('payment_success') : t('payment_failed')}</h1>
          {result.success ? <p className="mt-1 text-3xl font-black">{rupees(result.amount)}</p> : <p className="mt-1 text-muted">{t('payment_failed_sub')}</p>}
          {result.success && (
            <Card className="mt-8 w-full p-4 text-left">
              <KeyValue k={t('payment_ref')} v={<span className="font-mono text-xs">{result.payment_ref}</span>} />
              <KeyValue k={t('order_id')} v={<span className="font-mono text-xs">{result.order_id}</span>} />
              <KeyValue k={t('paid_on')} v={`${dateOnly(result.paid_at, lang)} ${timeOnly(result.paid_at, lang)}`} />
              <KeyValue k="Job" v={data.job.code} />
            </Card>
          )}
        </div>
        <div className="space-y-2 p-4">
          {result.success
            ? <Button size="lg" full onClick={() => router.replace(`/c/jobs/${id}`)}>{t('done')}</Button>
            : <>
                <Button size="lg" full onClick={() => { setStage('choose'); setResult(null); }}>{t('retry')}</Button>
                <Button variant="ghost" full onClick={() => router.replace(`/c/jobs/${id}`)}>{t('back')}</Button>
              </>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-stone-100">
      <TopBar title={t('upi_gateway')} back={`/c/jobs/${id}`} />
      <div className="space-y-4 p-4">
        <Card className="flex items-center gap-3 p-4">
          <LogoMark className="size-10" />
          <div className="flex-1">
            <p className="font-bold">DiNaDeNa</p>
            <p className="text-xs text-muted">{data.job.code} · {data.bookings.length} {data.bookings.length > 1 ? t('workers') : t('worker')}</p>
          </div>
          <p className="text-2xl font-black">{rupees(due)}</p>
        </Card>

        {due === 0 ? <Alert tone="green">{t('paid')}</Alert> : (
          <>
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">{t('choose_upi_app')}</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 'upi' as const, icon: Smartphone, label: 'UPI app / UPI ID' },
                  { v: 'qr' as const, icon: QrCode, label: 'Scan QR' },
                ].map((m) => (
                  <button key={m.v} type="button" onClick={() => setMethod(m.v)} aria-pressed={method === m.v}
                    className={cx('flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-semibold',
                      method === m.v ? 'border-brand-500 bg-brand-50' : 'border-line bg-white')}>
                    <m.icon className="size-7 text-brand-600" />{m.label}
                  </button>
                ))}
              </div>
              {method === 'qr' && (
                <div className="mt-4 flex justify-center">
                  <div className="grid size-40 grid-cols-8 gap-0.5 rounded-lg bg-white p-2 ring-1 ring-line" aria-label="Demo QR">
                    {Array.from({ length: 64 }, (_, i) => (
                      <span key={i} className={((i * 37 + (i >> 3) * 11) % 5) < 2 ? 'bg-ink' : 'bg-white'} />
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Alert tone="blue" icon={<IndianRupee className="size-4" />}>{t('demo_gateway_hint')}</Alert>
            {error && <Alert tone="red">{error}</Alert>}

            {stage === 'processing' ? (
              <Card className="flex flex-col items-center gap-3 p-8">
                <Spinner className="size-10" />
                <p className="font-semibold">{t('processing')}</p>
              </Card>
            ) : (
              <div className="space-y-2">
                <Button size="lg" full variant="success" onClick={() => pay(true)}>{t('simulate_success')} · {rupees(due)}</Button>
                <Button size="lg" full variant="danger" onClick={() => pay(false)}>{t('simulate_failure')}</Button>
              </div>
            )}
          </>
        )}
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3.5" />{t('secure_payment')}</p>
      </div>
    </div>
  );
}
