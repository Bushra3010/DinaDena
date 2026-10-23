'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight, Clock, MapPin, Users } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Card } from '@/components/ui';
import { duration, rupees } from '@/lib/format';
import { useCategories } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { NearbyJob } from '@/lib/types';

export function WorkerJobCard({ job, compact = false }: { job: NearbyJob; compact?: boolean }) {
  const categories = useCategories();
  const { t, lang } = useI18n();
  const category = categories.find((c) => c.id === job.category_id);
  const open = job.workers_needed - job.slots_filled;
  return (
    <Card className="worker-job-card p-3.5">
      <Link href={`/w/jobs/${job.id}`} className="flex gap-3">
        <CategoryIcon icon={category?.icon} boxed className="size-13" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2"><h3 className="pt-0.5 text-sm font-bold leading-snug">{job.title}</h3><span className="shrink-0 text-[23px] font-bold leading-tight tracking-tight text-brand-500">{rupees(job.rate_per_worker)}</span></div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted"><span className="flex items-center gap-1.5"><MapPin className="size-4" />{job.distance_km.toFixed(1)} km</span><span className="flex items-center gap-1.5"><Clock className="size-4" />{duration(job.duration_minutes, lang)}</span></div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">{!compact && <Users className="size-4" />}{compact ? t('spots_available', { n: open }) : `${open} ${open === 1 ? t('worker') : t('workers')}`}</p>
          {!compact && job.description && <p className="mt-1 text-xs leading-relaxed text-muted">{job.description}</p>}
        </div>
        {compact && <ChevronRight className="mt-8 size-4 shrink-0 text-muted" />}
      </Link>
      {!compact && <Link href={`/w/jobs/${job.id}`} className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-brand-50 text-sm font-semibold text-brand-500">{t('view_details')}<ArrowRight className="size-4" /></Link>}
    </Card>
  );
}
