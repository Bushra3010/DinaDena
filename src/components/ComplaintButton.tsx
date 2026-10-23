'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useI18n, type TKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { Alert, Button, Field, Modal, Select, Textarea } from './ui';

const TOPICS: TKey[] = ['topic_late', 'topic_noshow', 'topic_quality', 'topic_payment', 'topic_behaviour', 'topic_other'];

export function ComplaintButton({ jobId, bookingId, label, variant = 'outline', full = true, size }: {
  jobId?: string; bookingId?: string; label?: string; variant?: 'outline' | 'danger' | 'soft' | 'ghost'; full?: boolean; size?: 'sm';
}) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<TKey>(TOPICS[0]!);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) return setError(t('required'));
    setBusy(true);
    const { error } = await supabase.from('complaints').insert({
      job_id: jobId ?? null, booking_id: bookingId ?? null, raised_by: profile!.id,
      // Stored in English so the admin team reads one language.
      topic: ({ topic_late: 'Worker arrived late', topic_noshow: 'Worker did not show up', topic_quality: 'Poor quality of work',
        topic_payment: 'Payment issue', topic_behaviour: 'Behaviour / safety', topic_other: 'Other' } as Record<string, string>)[topic],
      description: text.trim(),
      priority: topic === 'topic_behaviour' || topic === 'topic_noshow' ? 'high' : 'medium',
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
  }

  return (
    <>
      <Button variant={variant} full={full} size={size} icon={<Flag className="size-4" />} onClick={() => { setOpen(true); setDone(false); setText(''); setError(null); }}>
        {label ?? t('raise_complaint')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={label ?? t('raise_complaint')}>
        {done ? (
          <div className="space-y-4">
            <Alert tone="green">{t('complaint_sent')}</Alert>
            <Button full onClick={() => setOpen(false)}>{t('done')}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label={t('complaint_topic')} htmlFor="topic">
              <Select id="topic" value={topic} onChange={(e) => setTopic(e.target.value as TKey)}>
                {TOPICS.map((k) => <option key={k} value={k}>{t(k)}</option>)}
              </Select>
            </Field>
            <Field label={t('complaint_details')} htmlFor="ctext" error={error}>
              <Textarea id="ctext" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
            </Field>
            <Button full loading={busy} onClick={submit}>{t('submit')}</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
