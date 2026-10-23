'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BadgeCheck, Briefcase, Camera, CircleX, Clock, FileCheck2, FileX2, Landmark, LogOut, MapPin, Pencil, Phone, Star, Wallet,
} from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Alert, Avatar, Badge, Button, Card, KeyValue, LinkButton, PageLoader, SectionTitle, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateOnly, formatPhone } from '@/lib/format';
import { useCategories } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { publicUrl, uploadFile } from '@/lib/supabase';
import { useMyWorker } from '@/lib/worker';

// Worker's own profile: everything an admin verifies, read-only here, edited via /w/register.
export default function WorkerProfilePage() {
  const { profile, updateProfile, signOut } = useAuth();
  const { t, catName } = useI18n();
  const router = useRouter();
  const categories = useCategories();
  const { data: me, loading } = useMyWorker(profile?.id);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !me || !profile) return <PageLoader />;
  const wp = me.profile;
  const pr = me.private;
  const skills = categories.filter((c) => wp.category_ids.includes(c.id));

  const status = {
    approved: { tone: 'green' as const, icon: BadgeCheck, label: t('verified_worker') },
    pending: { tone: 'amber' as const, icon: Clock, label: t('under_verification') },
    rejected: { tone: 'red' as const, icon: CircleX, label: t('profile_rejected') },
    suspended: { tone: 'red' as const, icon: CircleX, label: t('profile_suspended') },
  }[wp.status];

  async function changePhoto(f: File) {
    setUploading(true);
    setError(null);
    try {
      await updateProfile({ avatar_url: publicUrl('avatars', await uploadFile('avatars', profile!.id, f)) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <TopBar title={t('nav_profile')} right={
        <LinkButton href="/w/register" size="sm" variant="soft" icon={<Pencil className="size-4" />}>{t('edit')}</LinkButton>
      } />
      <div className="space-y-4 p-4">
        <Card className="flex flex-col items-center p-5 text-center">
          <label className="relative cursor-pointer" aria-busy={uploading}>
            <Avatar name={profile.full_name} url={profile.avatar_url} size={92} className={uploading ? 'opacity-50' : ''} />
            <span className="absolute bottom-0 right-0 rounded-full bg-brand-500 p-1.5 text-white ring-2 ring-white"><Camera className="size-4" /></span>
            <input type="file" accept="image/*" className="sr-only" aria-label="Change photo"
              onChange={(e) => e.target.files?.[0] && changePhoto(e.target.files[0])} />
          </label>
          <h1 className="mt-3 text-xl font-extrabold">{profile.full_name}</h1>
          <p className="flex items-center gap-1 text-sm text-muted"><Phone className="size-3.5" />{formatPhone(profile.phone)}</p>
          <Badge tone={status.tone} className="mt-2"><status.icon className="size-3.5" />{status.label}</Badge>
          <div className="mt-4 grid w-full grid-cols-3 divide-x divide-line rounded-2xl border border-line">
            <div className="py-3"><p className="flex items-center justify-center gap-1 text-lg font-bold"><Star className="size-4 fill-amber-400 text-amber-400" />{Number(wp.rating_avg).toFixed(1)}</p><p className="text-xs text-muted">{wp.rating_count} {t('reviews')}</p></div>
            <div className="py-3"><p className="text-lg font-bold">{wp.jobs_completed}</p><p className="text-xs text-muted">{t('jobs_done')}</p></div>
            <div className="py-3"><p className="text-lg font-bold">{t('years', { n: wp.experience_years })}</p><p className="text-xs text-muted">{t('experience')}</p></div>
          </div>
        </Card>

        {error && <Alert tone="red">{error}</Alert>}
        {(wp.status === 'rejected' || wp.status === 'suspended') && wp.rejection_reason && (
          <Alert tone="red" title={status.label}>{wp.rejection_reason}</Alert>
        )}

        <Card className="p-4">
          <SectionTitle>{t('skills')}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {skills.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
                <CategoryIcon icon={c.icon} className="size-4" />{catName(c)}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>{t('worker_details')}</SectionTitle>
          <KeyValue k={<span className="flex items-center gap-2"><Briefcase className="size-4" />{t('experience')}</span>} v={t('years', { n: wp.experience_years })} />
          <KeyValue k={<span className="flex items-center gap-2"><MapPin className="size-4" />{t('home_area')}</span>} v={wp.home_area ?? '—'} />
          <KeyValue k={<span className="flex items-center gap-2"><Clock className="size-4" />{t('member_since')}</span>} v={dateOnly(wp.created_at)} />
          {wp.bio && <p className="mt-2 border-t border-line pt-2 text-sm text-muted">{wp.bio}</p>}
        </Card>

        <Card className="p-4">
          <SectionTitle>{t('id_verification')}</SectionTitle>
          <div className="flex items-center gap-3 text-sm">
            {pr?.id_doc_path ? <FileCheck2 className="size-5 text-emerald-600" /> : <FileX2 className="size-5 text-amber-600" />}
            <span className="flex-1 font-medium">{pr?.id_doc_type ?? '—'}</span>
            <Badge tone={pr?.id_doc_path ? 'green' : 'amber'}>{pr?.id_doc_path ? t('uploaded') : t('not_uploaded')}</Badge>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>{t('payout_details')}</SectionTitle>
          <KeyValue k={<span className="flex items-center gap-2"><Landmark className="size-4" />{t('bank_name')}</span>}
            v={pr?.bank_name ? `${pr.bank_name} ••${pr.bank_account_last4 ?? ''}` : '—'} />
          <KeyValue k={<span className="flex items-center gap-2"><Wallet className="size-4" />{t('upi_id')}</span>} v={pr?.upi_id ?? '—'} />
        </Card>

        <LinkButton href="/w/register" full variant="outline" icon={<Pencil className="size-4" />}>{t('edit_profile')}</LinkButton>
        <Button variant="danger" full icon={<LogOut className="size-4" />} onClick={async () => { await signOut(); router.replace('/login?as=worker'); }}>
          {t('logout')}
        </Button>
      </div>
    </>
  );
}
