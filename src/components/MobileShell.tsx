'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useRequireRole } from '@/lib/auth';
import { useLoad, useRealtime } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Role } from '@/lib/types';
import { cx, PageLoader } from './ui';

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: boolean };

/** Phone-width frame shared by the customer and worker apps. */
export function MobileShell({ role, nav, children, overlay }: { role: Role; nav: NavItem[]; children: ReactNode; overlay?: ReactNode }) {
  const { allowed, profile } = useRequireRole(role);
  const pathname = usePathname();
  const unread = useUnreadCount(profile?.id);
  // Bottom nav shows only on the tab roots, not on deeper flow screens.
  const hideNav = !nav.some((n) => pathname === n.href);

  return (
    <div className="min-h-dvh bg-stone-200/60">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-canvas shadow-xl shadow-stone-300/40">
        {!allowed ? <PageLoader /> : (
          <>
            <main className={cx('flex-1', !hideNav && 'pb-20')}>{children}</main>
            {!hideNav && (
              <nav className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
                {nav.map((n) => {
                  const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
                  return (
                    <Link key={n.href} href={n.href}
                      className={cx('relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                        active ? 'text-brand-500' : 'text-muted')}>
                      <n.icon className="size-5.5" aria-hidden />
                      {n.label}
                      {n.badge && unread > 0 && (
                        <span className="absolute right-[calc(50%-20px)] top-2 flex min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] text-white">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            )}
            {overlay}
          </>
        )}
      </div>
    </div>
  );
}

export function useUnreadCount(userId: string | undefined) {
  const [bump, setBump] = useState(0);
  useRealtime('notifications', userId ? `user_id=eq.${userId}` : null, () => setBump((b) => b + 1), !!userId);
  const { data } = useLoad(async () => {
    if (!userId) return 0;
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('read', false);
    return count ?? 0;
  }, [userId, bump]);
  return data ?? 0;
}
