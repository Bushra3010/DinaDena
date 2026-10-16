'use client';

import { Bell, ClipboardList, House, UserRound } from 'lucide-react';
import { MobileShell } from '@/components/MobileShell';
import { useI18n } from '@/lib/i18n';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <MobileShell role="customer" nav={[
      { href: '/c', label: t('nav_home'), icon: House, exact: true },
      { href: '/c/bookings', label: t('nav_jobs'), icon: ClipboardList },
      { href: '/c/notifications', label: t('nav_messages'), icon: Bell, badge: true },
      { href: '/c/profile', label: t('nav_profile'), icon: UserRound },
    ]}>
      {children}
    </MobileShell>
  );
}
