'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Languages, LogOut, Phone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { formatPhone } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { publicUrl, uploadFile } from '@/lib/supabase';
import type { Lang } from '@/lib/types';
import { Alert, Avatar, Button, Card, Field, Input, Segmented, TopBar } from './ui';

export function ProfileSettings({ children }: { children?: ReactNode }) {
  const { profile, updateProfile, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'green', text: '✓' });
    } catch (e) {
      setMsg({ tone: 'red', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const changeLang = (l: Lang) => {
    setLang(l);
    updateProfile({ language: l }).catch(() => undefined);
  };

  return (
    <>
      <TopBar title={t('nav_profile')} />
      <div className="space-y-4 p-4">
        <Card className="flex flex-col items-center p-5">
          <label className="relative cursor-pointer">
            <Avatar name={profile?.full_name} url={profile?.avatar_url} size={88} />
            <span className="absolute bottom-0 right-0 rounded-full bg-brand-500 p-1.5 text-white ring-2 ring-white"><Camera className="size-4" /></span>
            <input type="file" accept="image/*" className="sr-only" aria-label="Change photo" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run(async () => updateProfile({ avatar_url: publicUrl('avatars', await uploadFile('avatars', profile!.id, f)) }));
            }} />
          </label>
          <p className="mt-3 text-lg font-bold">{profile?.full_name}</p>
          <p className="flex items-center gap-1 text-sm text-muted"><Phone className="size-3.5" />{formatPhone(profile?.phone)}</p>
        </Card>

        <Card className="space-y-3 p-4">
          <Field label={t('full_name')} htmlFor="pname">
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button size="sm" loading={busy} disabled={!name.trim() || name === profile?.full_name}
            onClick={() => run(() => updateProfile({ full_name: name.trim() }))}>{t('save')}</Button>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        </Card>

        <Card className="p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Languages className="size-4" />{t('language')}</p>
          <Segmented value={lang} onChange={changeLang} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
        </Card>

        {children}

        <Button variant="danger" full icon={<LogOut className="size-4" />} onClick={async () => { await signOut(); router.replace(`/login?as=${profile?.role ?? 'customer'}`); }}>
          {t('logout')}
        </Button>
      </div>
    </>
  );
}
