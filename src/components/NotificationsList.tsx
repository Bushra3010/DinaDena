'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useLoad, useRealtime } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/lib/types';
import { Button, cx, Empty, PageLoader, TopBar } from './ui';

export function NotificationsList() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const { data, loading, reload } = useLoad(async () => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', profile!.id)
      .order('created_at', { ascending: false }).limit(50);
    return (data ?? []) as Notification[];
  }, [profile?.id]);
  useRealtime('notifications', `user_id=eq.${profile!.id}`, reload);

  const markAll = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile!.id).eq('read', false);
    reload();
  };

  return (
    <>
      <TopBar title={t('notifications')} right={data?.some((n) => !n.read) && (
        <Button size="sm" variant="ghost" onClick={markAll}>{t('mark_all_read')}</Button>
      )} />
      {loading && !data ? <PageLoader /> : !data?.length ? (
        <Empty icon={<Bell className="size-6" />} title={t('no_notifications')} />
      ) : (
        <ul className="divide-y divide-line bg-white">
          {data.map((n) => {
            const body = (
              <div className="flex gap-3 px-4 py-3.5">
                <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-500')} />
                <div className="min-w-0 flex-1">
                  <p className={cx('text-sm', !n.read && 'font-semibold')}>{n.title}</p>
                  {n.body && <p className="text-sm text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.created_at, lang)}</p>
                </div>
              </div>
            );
            const onClick = () => { if (!n.read) supabase.from('notifications').update({ read: true }).eq('id', n.id).then(); };
            return <li key={n.id}>{n.link ? <Link href={n.link} onClick={onClick}>{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </>
  );
}
