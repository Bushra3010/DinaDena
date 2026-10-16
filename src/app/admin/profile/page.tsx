'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Camera, LogOut, Phone, Shield } from 'lucide-react';
import { PageHeader } from '@/components/admin/AdminShell';
import { Alert, Avatar, Badge, Button, Card, Field, Input, KeyValue } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateOnly, formatPhone } from '@/lib/format';
import { publicUrl, uploadFile } from '@/lib/supabase';

export default function AdminProfile() {
  const { profile, updateProfile, signOut } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'green', text: ok });
    } catch (e) {
      setMsg({ tone: 'red', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="My Profile" sub="Your admin account" />
      <div className="grid max-w-3xl gap-4 md:grid-cols-[260px_1fr]">
        <Card className="flex flex-col items-center p-5 text-center">
          <label className="relative cursor-pointer">
            <Avatar name={profile?.full_name} url={profile?.avatar_url} size={96} />
            <span className="absolute bottom-0 right-0 rounded-full bg-brand-500 p-1.5 text-white ring-2 ring-white"><Camera className="size-4" /></span>
            <input type="file" accept="image/*" className="sr-only" aria-label="Change photo" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run(async () => updateProfile({ avatar_url: publicUrl('avatars', await uploadFile('avatars', profile!.id, f)) }), 'Photo updated');
            }} />
          </label>
          <p className="mt-3 text-lg font-bold">{profile?.full_name}</p>
          <p className="flex items-center gap-1 text-sm text-muted"><Phone className="size-3.5" />{formatPhone(profile?.phone)}</p>
          <Badge tone="purple" className="mt-2"><Shield className="size-3.5" />Admin</Badge>
        </Card>
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <Field label="Full name" htmlFor="admin-name">
              <Input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button loading={busy} disabled={!name.trim() || name === profile?.full_name}
              onClick={() => run(() => updateProfile({ full_name: name.trim() }), 'Saved')}>Save</Button>
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          </Card>
          <Card className="p-5">
            <KeyValue k="Role" v="Admin" />
            <KeyValue k="Phone" v={formatPhone(profile?.phone)} />
            <KeyValue k="Member since" v={profile ? dateOnly(profile.created_at) : '—'} />
          </Card>
          <Button variant="danger" icon={<LogOut className="size-4" />} onClick={async () => { await signOut(); router.replace('/login?as=admin'); }}>Log out</Button>
        </div>
      </div>
    </>
  );
}
