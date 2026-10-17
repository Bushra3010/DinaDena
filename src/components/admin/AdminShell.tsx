'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  Bell, ClipboardList, UserRound, CreditCard, FileText, Fingerprint, HardHat, LayoutDashboard, LogOut, Menu, ShieldAlert, Tags, Users, X,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useUnreadCount } from '@/components/MobileShell';
import { Avatar, cx, PageLoader } from '@/components/ui';
import { useAuth, useRequireRole } from '@/lib/auth';
import { useLoad, useRealtime } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/requests', label: 'Live Requests', icon: ClipboardList },
  { href: '/admin/workers', label: 'Workers', icon: HardHat, badge: 'pending' as const },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/attendance', label: 'Attendance', icon: Fingerprint },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/complaints', label: 'Complaints', icon: ShieldAlert, badge: 'complaints' as const },
  { href: '/admin/categories', label: 'Categories & Pricing', icon: Tags },
  { href: '/admin/reports', label: 'Reports', icon: FileText },
  { href: '/admin/profile', label: 'My Profile', icon: UserRound },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { allowed, profile } = useRequireRole('admin');
  const { signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount(profile?.id);

  const { data: counts, reload } = useLoad(async () => {
    if (!allowed) return { pending: 0, complaints: 0 };
    const [{ count: pending }, { count: complaints }] = await Promise.all([
      supabase.from('worker_profiles').select('user_id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('complaints').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_review']),
    ]);
    return { pending: pending ?? 0, complaints: complaints ?? 0 };
  }, [allowed, pathname]);
  useRealtime('jobs', null, reload, allowed);

  if (!allowed) return <PageLoader />;

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Admin">
      <div className="mb-4 px-2 pt-2"><Logo sub="Admin Console" /></div>
      {NAV.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        const count = n.badge ? counts?.[n.badge] ?? 0 : 0;
        return (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cx('admin-nav-item flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
              active ? 'bg-brand-500 text-white' : 'text-muted hover:bg-brand-50 hover:text-ink')}>
            <n.icon className="size-4.5" />
            <span className="flex-1">{n.label}</span>
            {count > 0 && <span className={cx('rounded-full px-1.5 text-xs', active ? 'bg-white/25' : 'bg-brand-100 text-brand-700')}>{count}</span>}
          </Link>
        );
      })}
      <button type="button" onClick={async () => { await signOut(); router.replace('/login?as=admin'); }}
        className="mt-auto flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-brand-50">
        <LogOut className="size-4.5" />Log out
      </button>
    </nav>
  );

  return (
    <div className="admin-shell min-h-dvh">
      <aside className="admin-sidebar fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-2 top-2 flex size-10 items-center justify-center"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur lg:px-6">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="flex size-10 items-center justify-center rounded-lg hover:bg-brand-50 lg:hidden"><Menu className="size-5" /></button>
          <p className="flex-1 text-sm text-muted">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <span className="relative"><Bell className="size-5 text-muted" />{unread > 0 && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-brand-500" />}</span>
          <Link href="/admin/profile" className="flex items-center gap-2 rounded-full pr-2 hover:bg-brand-50" aria-label="My profile">
            <Avatar name={profile?.full_name} url={profile?.avatar_url} size={34} />
            <span className="hidden text-sm font-semibold sm:block">{profile?.full_name}</span>
          </Link>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ n, title, sub, actions }: { n?: string; title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {n && <span className="flex size-9 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">{n}</span>}
        <div>
          <h1 className="text-xl font-extrabold">{title}</h1>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="admin-table overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line bg-brand-50/50 text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="p-8 text-center text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) =>
  <td className={cx('px-4 py-3 align-middle', className)}>{children}</td>;

export function StatCard({ label, value, icon, tone = 'brand', hint }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'brand' | 'blue' | 'green' | 'amber' | 'red'; hint?: ReactNode }) {
  const t = { brand: 'bg-brand-50 text-brand-600', blue: 'bg-sky-50 text-sky-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600' }[tone];
  return (
    <div className="admin-stat flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
      <div className={cx('flex size-12 items-center justify-center rounded-full', t)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-black tabular-nums">{value}</p>
        <p className="truncate text-sm text-muted">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}
