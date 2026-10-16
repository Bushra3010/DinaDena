'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { currentPosition, simulatedRoute } from '@/lib/geo';
import { useLoad, useRealtime } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Booking, Job } from '@/lib/types';

const SHARE_MS = 5_000;      // PRD: at least every 10 s
const ROUTE_STEPS = 24;      // simulated trip ≈ 2 minutes

/**
 * While a booking is on the way or in progress, writes the worker's position.
 * Uses real GPS when it is inside the launch city; otherwise (demo, desktop)
 * walks a simulated route from the worker's home to the job.
 */
export function LocationSharer({ userId }: { userId: string }) {
  const { data, reload } = useLoad(async () => {
    const { data: bookings } = await supabase.from('bookings').select('*').eq('worker_id', userId)
      .in('status', ['on_the_way', 'in_progress']);
    const bs = (bookings ?? []) as Booking[];
    if (!bs.length) return null;
    const [{ data: jobs }, { data: home }] = await Promise.all([
      supabase.from('jobs').select('id, lat, lng').in('id', bs.map((b) => b.job_id)),
      supabase.from('worker_private').select('home_lat, home_lng').eq('user_id', userId).maybeSingle(),
    ]);
    return { bookings: bs, jobs: (jobs ?? []) as Pick<Job, 'id' | 'lat' | 'lng'>[], home };
  }, [userId]);
  useRealtime('bookings', `worker_id=eq.${userId}`, reload);

  const dataRef = useRef(data);
  useLayoutEffect(() => {
    dataRef.current = data;
  });
  const active = !!data?.bookings.length;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const tick = async () => {
      const d = dataRef.current;
      if (!d || stopped) return;
      const gps = await currentPosition(4000);
      const rows = d.bookings.map((b) => {
        const job = d.jobs.find((j) => j.id === b.job_id);
        if (!job) return null;
        let p = gps;
        if (!p) {
          if (b.status === 'in_progress') p = { lat: job.lat, lng: job.lng };
          else {
            const from = d.home?.home_lat != null ? { lat: d.home.home_lat, lng: d.home.home_lng! } : { lat: job.lat + 0.02, lng: job.lng - 0.02 };
            const route = simulatedRoute(from, job, ROUTE_STEPS);
            const step = Math.floor((Date.now() - new Date(b.on_the_way_at ?? Date.now()).getTime()) / SHARE_MS);
            p = route[Math.min(step, route.length - 1)]!;
          }
        }
        return { booking_id: b.id, worker_id: userId, lat: p.lat, lng: p.lng };
      }).filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length) await supabase.from('worker_locations').insert(rows);
    };
    tick();
    const id = setInterval(tick, SHARE_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, userId]);

  return null;
}
