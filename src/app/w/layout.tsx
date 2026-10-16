'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardList, House, UserRound, Wallet } from 'lucide-react';
import { IncomingRequests } from '@/components/worker/IncomingRequests';
import { LocationSharer } from '@/components/worker/LocationSharer';
import { MobileShell } from '@/components/MobileShell';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useMyWorker } from '@/lib/worker';

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <MobileShell role="worker" overlay={<WorkerBackground />} nav={[
      { href: '/w', label: t('nav_home'), icon: House, exact: true },
      { href: '/w/jobs', label: t('nav_jobs'), icon: ClipboardList },
      { href: '/w/earnings', label: t('nav_earnings'), icon: Wallet },
      { href: '/w/profile', label: t('nav_profile'), icon: UserRound },
    ]}>
      <RegistrationGate>{children}</RegistrationGate>
    </MobileShell>
  );
}

// Workers without a worker profile go to registration first.
function RegistrationGate({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const pathname = usePathname();
  const { data, loading } = useMyWorker(profile?.id, pathname);
  const router = useRouter();
  const missing = !loading && data === null;
  useEffect(() => {
    if (missing && pathname !== '/w/register') router.replace('/w/register');
  }, [missing, pathname, router]);
  if (missing && pathname !== '/w/register') return null;
  return children;
}

function WorkerBackground() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <>
      <IncomingRequests userId={profile.id} />
      <LocationSharer userId={profile.id} />
    </>
  );
}
