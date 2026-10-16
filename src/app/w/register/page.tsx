'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CircleCheck, Clock, FileUp, Landmark } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Logo } from '@/components/Logo';
import { Alert, Avatar, Button, Card, Chip, Field, Input, PageLoader, Select, Textarea, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { AREAS } from '@/lib/geo';
import { useCategories } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { publicUrl, supabase, uploadFile } from '@/lib/supabase';
import { useMyWorker } from '@/lib/worker';

const DOC_TYPES = ['Aadhaar Card', 'Voter ID', 'PAN Card', 'Driving Licence'];

export default function RegisterWorker() {
  const { profile } = useAuth();
  const { data: me, loading } = useMyWorker(profile?.id);
  if (loading) return <PageLoader />;
  return <RegisterForm me={me ?? null} />;
}

function RegisterForm({ me }: { me: NonNullable<ReturnType<typeof useMyWorker>['data']> | null }) {
  const { profile, updateProfile } = useAuth();
  const { t, catName } = useI18n();
  const router = useRouter();
  const categories = useCategories();
  const editing = !!me;

  // Prefilled from the existing worker profile when editing.
  const [name, setName] = useState(profile?.full_name ?? '');
  const [skills, setSkills] = useState<string[]>(me?.profile.category_ids ?? []);
  const [experience, setExperience] = useState(me?.profile.experience_years ?? 1);
  const [area, setArea] = useState(me?.profile.home_area ?? AREAS[0]!.name);
  const [bio, setBio] = useState(me?.profile.bio ?? '');
  const [docType, setDocType] = useState(me?.private?.id_doc_type ?? DOC_TYPES[0]!);
  const [docPath, setDocPath] = useState<string | null>(me?.private?.id_doc_path ?? null);
  const [bank, setBank] = useState(me?.private?.bank_name ?? '');
  const [last4, setLast4] = useState(me?.private?.bank_account_last4 ?? '');
  const [upi, setUpi] = useState(me?.private?.upi_id ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function upload(kind: 'avatar' | 'doc', file: File) {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'avatar') {
        await updateProfile({ avatar_url: publicUrl('avatars', await uploadFile('avatars', profile!.id, file)) });
      } else {
        setDocPath(await uploadFile('worker-docs', profile!.id, file));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !skills.length) return setError(`${t('full_name')} / ${t('select_skills')}: ${t('required')}`);
    if (last4 && !/^\d{4}$/.test(last4)) return setError(t('account_last4'));
    setBusy('submit');
    try {
      const home = AREAS.find((a) => a.name === area) ?? AREAS[0]!;
      if (name.trim() !== profile?.full_name) await updateProfile({ full_name: name.trim() });
      const { error: e1 } = await supabase.from('worker_profiles').upsert({
        user_id: profile!.id, category_ids: skills, experience_years: experience, home_area: home.name, bio: bio.trim() || null,
      });
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from('worker_private').upsert({
        user_id: profile!.id, home_lat: home.lat, home_lng: home.lng, id_doc_type: docType, id_doc_path: docPath,
        bank_name: bank.trim() || null, bank_account_last4: last4 || null, upi_id: upi.trim() || null,
      });
      if (e2) throw new Error(e2.message);
      setSaved(true);
      router.replace(editing ? '/w/profile' : '/w');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white pb-10">
      {editing ? <TopBar title={t('edit_worker_profile')} back="/w/profile" /> : <div className="px-4 pt-4"><Logo /></div>}
      <form onSubmit={submit} className="space-y-5 p-4">
        {!editing && <h1 className="text-xl font-extrabold">{t('create_worker_account')}</h1>}

        <div className="flex items-center gap-4">
          <label className="relative shrink-0 cursor-pointer">
            <Avatar name={name || profile?.full_name} url={profile?.avatar_url} size={84} />
            <span className="absolute bottom-0 right-0 rounded-full bg-brand-500 p-1.5 text-white ring-2 ring-white"><Camera className="size-4" /></span>
            <input type="file" accept="image/*" capture="user" className="sr-only" aria-label="Photo" onChange={(e) => e.target.files?.[0] && upload('avatar', e.target.files[0])} />
          </label>
          <div className="flex-1">
            <Field label={t('full_name')} htmlFor="wname">
              <Input id="wname" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">{t('select_skills')} <span className="font-normal text-muted">({t('choose_all')})</span></p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.id} active={skills.includes(c.id)} onClick={() => setSkills((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])}>
                <CategoryIcon icon={c.icon} className="size-4" />{catName(c)}
              </Chip>
            ))}
          </div>
        </div>

        <Field label={t('identity_document')}>
          <div className="flex items-center gap-2">
            <Select aria-label={t('identity_document')} value={docType} onChange={(e) => setDocType(e.target.value)} className="flex-1">
              {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
            </Select>
            {docPath ? (
              <span className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"><CircleCheck className="size-4" />{t('uploaded')}</span>
            ) : (
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700">
                <FileUp className="size-4" />{busy === 'doc' ? '…' : t('upload_id')}
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && upload('doc', e.target.files[0])} />
              </label>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('experience')} htmlFor="exp">
            <Select id="exp" value={experience} onChange={(e) => setExperience(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((y) => <option key={y} value={y}>{t('years', { n: y })}</option>)}
            </Select>
          </Field>
          <Field label={t('home_area')} htmlFor="harea">
            <Select id="harea" value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => <option key={a.name}>{a.name}</option>)}
            </Select>
          </Field>
        </div>

        <Field label={<>{t('short_bio')} <span className="font-normal text-muted">({t('optional')})</span></>} htmlFor="bio">
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
        </Field>

        <Card className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Landmark className="size-4" />{t('bank_account')}</p>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Input aria-label={t('bank_name')} placeholder={t('bank_name')} value={bank} onChange={(e) => setBank(e.target.value)} />
            <Input aria-label={t('account_last4')} placeholder={t('account_last4')} inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} />
          </div>
          <Input aria-label={t('upi_id')} placeholder={`${t('upi_id')} · name@upi`} value={upi} onChange={(e) => setUpi(e.target.value)} />
        </Card>

        {(!editing || me?.profile.status === 'pending') && (
          <Alert tone="brand" icon={<Clock className="size-5" />} title={t('under_verification')}>{t('under_verification_sub')}</Alert>
        )}
        {error && <Alert tone="red">{error}</Alert>}
        {saved && editing && <Alert tone="green">✓</Alert>}
        <Button type="submit" size="lg" full loading={busy === 'submit'}>{editing ? t('save') : t('submit_profile')}</Button>
      </form>
    </div>
  );
}
