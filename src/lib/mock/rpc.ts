// TypeScript ports of the Postgres functions in supabase/migrations/0001_schema.sql,
// so the mock backend enforces the same rules (pricing, slots, OTP, payment, reviews).

import { distanceKm } from '../geo';
import { commit, nowIso, table, uuid, type Row } from './store';

type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let changes: Map<string, Row[]> = new Map();
const touch = (t: string, r: Row) => {
  r.updated_at = nowIso();
  if (!changes.has(t)) changes.set(t, []);
  changes.get(t)!.push(r);
  return r;
};
const insert = (t: string, r: Row) => {
  const at = nowIso();
  const row = { id: uuid(), created_at: at, updated_at: at, ...r };
  table(t).push(row);
  return touch(t, row);
};
const fail = (msg: string): never => {
  throw new Error(msg);
};

const settings = () => table('app_settings')[0]!;
const profile = (id: string) => table('profiles').find((p) => p.id === id);
const worker = (id: string) => table('worker_profiles').find((w) => w.user_id === id);
const workerPrivate = (id: string) => table('worker_private').find((w) => w.user_id === id);
const category = (id: string) => table('categories').find((c) => c.id === id);
const jobById = (id: string) => table('jobs').find((j) => j.id === id);
const bookingById = (id: string) => table('bookings').find((b) => b.id === id);
const isAdmin = (uid: string | null) => !!uid && profile(uid)?.role === 'admin';
const isVerifiedWorker = (uid: string | null) => !!uid && !!worker(uid)?.verified;
const nextCode = () => 'QK' + (Math.max(100, ...table('jobs').map((j) => Number(String(j.code).slice(2)) || 0)) + 1);
const round1 = (n: number) => Math.round(n * 10) / 10;
const ACTIVE = ['accepted', 'on_the_way', 'in_progress', 'completed'];

function notify(user: string, title: string, body: string | null, link: string | null) {
  insert('notifications', { user_id: user, title, body, link, read: false, device_token: null });
}

function labourAmount(catId: string, workerId: string | null, minutes: number) {
  const c = category(catId) ?? fail('unknown category');
  if (minutes >= 480) return (worker(workerId ?? '')?.daily_rate ?? c.daily_rate) * Math.ceil(minutes / 480);
  return Math.ceil((c.hourly_rate * minutes) / 60);
}

function card(w: Row, lat: number, lng: number, catId?: string) {
  const p = profile(w.user_id)!;
  const pr = workerPrivate(w.user_id);
  const c = category(catId ?? w.category_ids[0]);
  return {
    user_id: w.user_id, full_name: p.full_name, avatar_url: p.avatar_url, category_ids: w.category_ids, bio: w.bio,
    experience_years: w.experience_years, home_area: w.home_area, available: w.available, rating_avg: w.rating_avg,
    rating_count: w.rating_count, jobs_completed: w.jobs_completed, daily_rate: w.daily_rate ?? c?.daily_rate ?? 0,
    distance_km: pr?.home_lat != null ? round1(distanceKm({ lat, lng }, { lat: pr.home_lat, lng: pr.home_lng })) : 999,
  };
}

function expireStale() {
  const now = nowIso();
  let n = 0;
  for (const b of table('bookings')) {
    if (b.status === 'requested' && b.expires_at && b.expires_at < now) {
      Object.assign(b, { status: 'expired', responded_at: now });
      touch('bookings', b);
      n++;
    }
  }
  for (const j of table('jobs')) {
    if (j.job_type === 'daily' && j.status === 'booked' &&
        !table('bookings').some((b) => b.job_id === j.id && !['rejected', 'expired', 'cancelled'].includes(b.status))) {
      j.status = 'cancelled';
      touch('jobs', j);
    }
  }
  return n;
}

const fns: Record<string, (a: Args, uid: string | null) => unknown> = {
  expire_stale_requests: () => expireStale(),

  search_workers: (a) => {
    const c = category(a.p_category);
    return table('worker_profiles')
      .filter((w) => w.verified && w.category_ids.includes(a.p_category) && (!a.p_available_only || w.available)
        && w.rating_avg >= (a.p_min_rating ?? 0))
      .map((w) => ({ ...card(w, a.p_lat, a.p_lng, a.p_category), daily_rate: w.daily_rate ?? c?.daily_rate }))
      .filter((w) => w.distance_km <= (a.p_radius_km ?? 10) && (a.p_max_rate == null || w.daily_rate <= a.p_max_rate))
      .sort((x, y) => x.distance_km - y.distance_km || y.rating_avg - x.rating_avg);
  },

  get_worker_card: (a) => {
    const w = worker(a.p_worker);
    return w?.verified ? [card(w, a.p_lat, a.p_lng)] : [];
  },

  price_quote: (a) => {
    const rate = labourAmount(a.p_category, a.p_worker ?? null, a.p_minutes);
    const fee = settings().platform_fee_per_worker;
    return { rate_per_worker: rate, platform_fee: fee, labour_total: rate * a.p_workers, fee_total: fee * a.p_workers, total: (rate + fee) * a.p_workers };
  },

  create_quick_job: (a, uid) => {
    if (!uid) fail('not signed in');
    const c = category(a.p_category);
    if (!c?.active) fail('unknown category');
    const s = settings();
        const job = insert('jobs', {
      code: nextCode(), customer_id: uid, category_id: a.p_category, job_type: 'quick', title: (a.p_title || '').trim() || c!.name_en,
      description: a.p_description, address: a.p_address, area: a.p_area, lat: a.p_lat, lng: a.p_lng,
      start_at: a.p_start_at ?? nowIso(), duration_minutes: a.p_duration_minutes, workers_needed: a.p_workers,
      rate_per_worker: labourAmount(a.p_category, null, a.p_duration_minutes), platform_fee: s.platform_fee_per_worker,
      photo_url: a.p_photo_url ?? null, status: 'open',
    });
    for (const w of table('worker_profiles')) {
      const pr = workerPrivate(w.user_id);
      if (w.verified && w.available && w.category_ids.includes(a.p_category) && pr?.home_lat != null &&
          distanceKm({ lat: a.p_lat, lng: a.p_lng }, { lat: pr.home_lat, lng: pr.home_lng }) <= s.search_radius_km) {
        notify(w.user_id, 'New quick job nearby', `${c!.name_en} · ${a.p_area ?? a.p_address}`, `/w/jobs/${job.id}`);
      }
    }
    return job.id;
  },

  book_worker: (a, uid) => {
    if (!uid) fail('not signed in');
    if (a.p_worker === uid) fail('cannot book yourself');
    const c = category(a.p_category);
    if (!c?.active) fail('unknown category');
    const w = worker(a.p_worker);
    if (!w?.verified || !w.category_ids.includes(a.p_category)) fail('worker not available for this category');
    const s = settings();
    const amount = labourAmount(a.p_category, a.p_worker, a.p_duration_minutes);
    const job = insert('jobs', {
      code: nextCode(), customer_id: uid, category_id: a.p_category,
      job_type: 'daily', title: c!.name_en, description: a.p_description, address: a.p_address, area: a.p_area, lat: a.p_lat,
      lng: a.p_lng, start_at: a.p_start_at ?? nowIso(), duration_minutes: a.p_duration_minutes, workers_needed: 1,
      rate_per_worker: amount, platform_fee: s.platform_fee_per_worker, photo_url: null, status: 'booked',
    });
    const b = insert('bookings', {
      job_id: job.id, customer_id: uid, worker_id: a.p_worker, status: 'requested', amount, platform_fee: s.platform_fee_per_worker,
      expires_at: new Date(Date.now() + s.request_timeout_minutes * 60_000).toISOString(), responded_at: null, on_the_way_at: null,
      check_in_at: null, check_out_at: null, paid_at: null, cancelled_at: null, extra_minutes_requested: 0, extra_minutes_approved: 0,
    });
    notify(a.p_worker, 'New booking request', `${c!.name_en} · ${a.p_area ?? a.p_address}`, `/w/bookings/${b.id}`);
    return job.id;
  },

  cancel_job: (a, uid) => {
    const j = jobById(a.p_job);
    if (!j || j.customer_id !== uid) fail('not your job');
    const bs = table('bookings').filter((b) => b.job_id === a.p_job);
    if (bs.some((b) => ['on_the_way', 'in_progress', 'completed'].includes(b.status))) fail('job already started');
    for (const b of bs.filter((x) => ['requested', 'accepted'].includes(x.status))) {
      Object.assign(b, { status: 'cancelled', cancelled_at: nowIso() });
      touch('bookings', b);
      notify(b.worker_id, 'Job cancelled', 'The customer cancelled this job', `/w/bookings/${b.id}`);
    }
    j!.status = 'cancelled';
    touch('jobs', j!);
    return null;
  },

  issue_attendance_otp: (a, uid) => {
    const b = bookingById(a.p_booking);
    if (!b || b.customer_id !== uid) fail('not your booking');
    const kind = ['accepted', 'on_the_way'].includes(b!.status) ? 'in' : b!.status === 'in_progress' ? 'out' : fail(`no attendance step for status ${b!.status}`);
    const otp = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const otps = table('booking_otps');
    const existing = otps.find((o) => o.booking_id === a.p_booking);
    const row = { booking_id: a.p_booking, kind, otp, attempts: 0, locked_until: null };
    if (existing) Object.assign(existing, row);
    else otps.push({ ...row, created_at: nowIso() });
    touch('booking_otps', existing ?? otps.at(-1)!);
    return { otp, kind };
  },

  respond_extra_time: (a, uid) => {
    const b = bookingById(a.p_booking);
    if (!b || b.customer_id !== uid) fail('not your booking');
    if (b!.extra_minutes_requested <= 0) fail('no pending request');
    if (a.p_approve) b!.extra_minutes_approved += b!.extra_minutes_requested;
    b!.extra_minutes_requested = 0;
    touch('bookings', b!);
    notify(b!.worker_id, a.p_approve ? 'Extra time approved' : 'Extra time declined', null, `/w/bookings/${b!.id}`);
    return null;
  },

  mock_pay_job: (a, uid) => {
    const j = jobById(a.p_job);
    if (!j || j.customer_id !== uid) fail('not your job');
    const ref = 'pay_mock_' + uuid().replace(/-/g, '').slice(0, 14);
    const order = 'order_mock_' + uuid().replace(/-/g, '').slice(0, 14);
    const due = table('bookings').filter((b) => b.job_id === a.p_job && b.status === 'completed' && !b.paid_at);
    if (!due.length) fail('nothing to pay');
    let total = 0;
    for (const b of due) {
      total += b.amount + b.platform_fee;
      insert('payments', {
        job_id: j!.id, booking_id: b.id, customer_id: uid, gateway: 'mock', gateway_order_id: order,
        gateway_payment_id: a.p_success ? ref : null, method: 'upi', amount: b.amount + b.platform_fee,
        status: a.p_success ? 'success' : 'failed',
      });
      if (a.p_success) {
        b.paid_at = nowIso();
        touch('bookings', b);
        insert('wallet_ledger', { user_id: b.worker_id, amount: b.amount, reason: 'job_payment', booking_id: b.id });
        notify(b.worker_id, 'Payment received', `₹${b.amount} · ${j!.code}`, '/w/earnings');
      }
    }
    if (a.p_success && !table('bookings').some((b) => b.job_id === j!.id && !['completed', 'rejected', 'expired', 'cancelled'].includes(b.status))) {
      j!.status = 'completed';
      touch('jobs', j!);
    }
    return { success: !!a.p_success, amount: total, payment_ref: ref, order_id: order, paid_at: nowIso() };
  },

  submit_review: (a, uid) => {
    const b = bookingById(a.p_booking);
    if (!b || (b.customer_id !== uid && b.worker_id !== uid)) fail('not your booking');
    if (b!.status !== 'completed') fail('booking not completed');
    if (table('reviews').some((r) => r.booking_id === b!.id && r.from_user === uid)) fail('You already reviewed this booking');
    const to = b!.customer_id === uid ? b!.worker_id : b!.customer_id;
    insert('reviews', { booking_id: b!.id, from_user: uid, to_user: to, rating: a.p_rating, comment: (a.p_comment || '').trim() || null });
    const w = worker(to);
    if (w) {
      // Seeded workers carry historic ratings; fold the new one into the running average.
      w.rating_avg = round1((w.rating_avg * w.rating_count + a.p_rating) / (w.rating_count + 1));
      w.rating_count += 1;
      touch('worker_profiles', w);
    }
    return null;
  },

  get_contact_phone: (a, uid) => {
    const b = bookingById(a.p_booking);
    if (!b || (b.customer_id !== uid && b.worker_id !== uid) || !['accepted', 'on_the_way', 'in_progress'].includes(b.status)) return null;
    return profile(b.customer_id === uid ? b.worker_id : b.customer_id)?.phone ?? null;
  },

  nearby_open_jobs: (a, uid) => {
    const w = uid ? worker(uid) : undefined;
    const pr = uid ? workerPrivate(uid) : undefined;
    if (!w?.verified || pr?.home_lat == null) return [];
    return table('jobs')
      .filter((j) => j.status === 'open' && j.job_type === 'quick' && w.category_ids.includes(j.category_id) && j.customer_id !== uid
        && !table('bookings').some((b) => b.job_id === j.id && b.worker_id === uid))
      .map((j) => ({
        ...j,
        slots_filled: table('bookings').filter((b) => b.job_id === j.id && ACTIVE.includes(b.status)).length,
        customer_name: profile(j.customer_id)?.full_name ?? null,
        distance_km: round1(distanceKm({ lat: pr.home_lat, lng: pr.home_lng }, j as { lat: number; lng: number })),
      }))
      .filter((j) => j.distance_km <= (a.p_radius_km ?? 10))
      .sort((x, y) => x.distance_km - y.distance_km);
  },

  accept_job: (a, uid) => {
    if (!isVerifiedWorker(uid)) fail('worker not verified');
    const j = jobById(a.p_job);
    if (!j || j.status !== 'open') fail('job is no longer open');
    if (j!.customer_id === uid) fail('cannot accept your own job');
    if (!worker(uid!)!.category_ids.includes(j!.category_id)) fail('job is not in your skills');
    if (table('bookings').some((b) => b.job_id === j!.id && b.worker_id === uid)) fail('You already took this job');
    const filled = table('bookings').filter((b) => b.job_id === j!.id && ACTIVE.includes(b.status)).length;
    if (filled >= j!.workers_needed) fail('all slots are filled');
    const b = insert('bookings', {
      job_id: j!.id, customer_id: j!.customer_id, worker_id: uid, status: 'accepted', amount: j!.rate_per_worker,
      platform_fee: j!.platform_fee, expires_at: null, responded_at: nowIso(), on_the_way_at: null, check_in_at: null,
      check_out_at: null, paid_at: null, cancelled_at: null, extra_minutes_requested: 0, extra_minutes_approved: 0,
    });
    if (filled + 1 >= j!.workers_needed) {
      j!.status = 'booked';
      touch('jobs', j!);
    }
    notify(j!.customer_id, 'Worker accepted your job', `${filled + 1} of ${j!.workers_needed} workers confirmed`, `/c/jobs/${j!.id}`);
    return b.id;
  },

  respond_booking: (a, uid) => {
    expireStale();
    const b = bookingById(a.p_booking);
    if (!b || b.worker_id !== uid) fail('not your booking');
    if (b!.status !== 'requested') fail(`request is ${b!.status}`);
    Object.assign(b!, { status: a.p_accept ? 'accepted' : 'rejected', responded_at: nowIso() });
    touch('bookings', b!);
    if (!a.p_accept) {
      const j = jobById(b!.job_id);
      if (j?.job_type === 'daily') {
        j.status = 'cancelled';
        touch('jobs', j);
      }
    }
    notify(b!.customer_id, a.p_accept ? 'Booking accepted' : 'Booking declined', null, `/c/jobs/${b!.job_id}`);
    return null;
  },

  start_trip: (a, uid) => {
    const b = bookingById(a.p_booking);
    if (!b || b.worker_id !== uid) fail('not your booking');
    if (b!.status !== 'accepted') fail(`booking is ${b!.status}`);
    Object.assign(b!, { status: 'on_the_way', on_the_way_at: nowIso() });
    touch('bookings', b!);
    notify(b!.customer_id, 'Worker is on the way', null, `/c/jobs/${b!.job_id}`);
    return null;
  },

  verify_attendance_otp: (a, uid) => {
    const b = bookingById(a.p_booking);
    if (!b || b.worker_id !== uid) fail('not your booking');
    const o = table('booking_otps').find((x) => x.booking_id === a.p_booking);
    if (!o) return { ok: false, error: 'otp_not_issued' };
    if (o.locked_until && o.locked_until > nowIso()) return { ok: false, error: 'locked', locked_until: o.locked_until };
    if (o.otp !== a.p_otp) {
      o.attempts += 1;
      if (o.attempts >= 3) o.locked_until = new Date(Date.now() + 15 * 60_000).toISOString();
      touch('booking_otps', o);
      return { ok: false, error: 'wrong_otp', attempts_left: Math.max(0, 3 - o.attempts) };
    }
    const j = jobById(b!.job_id)!;
    if (o.kind === 'in') {
      if (!['accepted', 'on_the_way'].includes(b!.status)) return { ok: false, error: 'bad_status' };
      insert('attendance_logs', { booking_id: b!.id, kind: 'in', at: nowIso(), lat: a.p_lat ?? null, lng: a.p_lng ?? null });
      Object.assign(b!, { status: 'in_progress', check_in_at: nowIso() });
      if (['open', 'booked'].includes(j.status)) {
        j.status = 'in_progress';
        touch('jobs', j);
      }
      notify(b!.customer_id, 'Work started', 'Check-in confirmed with OTP', `/c/jobs/${j.id}`);
    } else {
      if (b!.status !== 'in_progress') return { ok: false, error: 'bad_status' };
      insert('attendance_logs', { booking_id: b!.id, kind: 'out', at: nowIso(), lat: a.p_lat ?? null, lng: a.p_lng ?? null });
      const worked = Math.ceil((Date.now() - new Date(b!.check_in_at).getTime()) / 60_000);
      const billed = Math.max(j.duration_minutes, Math.min(worked, j.duration_minutes + b!.extra_minutes_approved));
      const amount = labourAmount(j.category_id, j.job_type === 'daily' ? b!.worker_id : null, billed);
      Object.assign(b!, { status: 'completed', check_out_at: nowIso(), amount, extra_minutes_requested: 0 });
      const w = worker(b!.worker_id);
      if (w) {
        w.jobs_completed += 1;
        touch('worker_profiles', w);
      }
      // Ask for payment once, with the job total, when the last worker checks out.
      const jobBookings = table('bookings').filter((x) => x.job_id === j.id);
      const stillWorking = jobBookings.some((x) => ['accepted', 'on_the_way', 'in_progress'].includes(x.status));
      const due = jobBookings.filter((x) => x.status === 'completed' && !x.paid_at).reduce((s, x) => s + x.amount + x.platform_fee, 0);
      notify(b!.customer_id, 'Work completed',
        stillWorking ? `${profile(b!.worker_id)?.full_name ?? 'Worker'} finished · ₹${amount + b!.platform_fee}` : `Please pay ₹${due}`,
        `/c/jobs/${j.id}`);
    }
    touch('bookings', b!);
    table('booking_otps').splice(table('booking_otps').indexOf(o), 1);
    return { ok: true, kind: o.kind };
  },

  request_extra_time: (a, uid) => {
    if (a.p_minutes < 15 || a.p_minutes > 240) fail('invalid minutes');
    const b = bookingById(a.p_booking);
    if (!b || b.worker_id !== uid) fail('not your booking');
    if (b!.status !== 'in_progress') fail('work not in progress');
    b!.extra_minutes_requested = a.p_minutes;
    touch('bookings', b!);
    notify(b!.customer_id, 'Extra time requested', `+${a.p_minutes} min`, `/c/jobs/${b!.job_id}`);
    return null;
  },

  admin_set_worker_status: (a, uid) => {
    if (!isAdmin(uid)) fail('admin only');
    const w = worker(a.p_worker) ?? fail('worker not found');
    Object.assign(w, {
      status: a.p_status, verified: a.p_status === 'approved',
      rejection_reason: ['rejected', 'suspended'].includes(a.p_status) ? a.p_reason : null,
      available: a.p_status === 'approved' ? w.available : false,
    });
    touch('worker_profiles', w);
    const title = { approved: 'Profile verified', rejected: 'Verification rejected', suspended: 'Account suspended' }[a.p_status as string] ?? 'Profile under review';
    notify(a.p_worker, title, a.p_reason ?? null, '/w');
    return null;
  },

  // Demo-only shortcut so one person can test the worker app without switching to admin.
  demo_self_approve: (_a, uid) => {
    const w = worker(uid ?? '') ?? fail('not a worker');
    Object.assign(w, { status: 'approved', verified: true, available: true, rejection_reason: null });
    touch('worker_profiles', w);
    notify(w.user_id, 'Profile verified', 'Approved via demo shortcut', '/w');
    return null;
  },

  admin_refund_booking: (a, uid) => {
    if (!isAdmin(uid)) fail('admin only');
    const p = table('payments').filter((x) => x.booking_id === a.p_booking && x.status === 'success').at(-1) ?? fail('no successful payment');
    p.status = 'refunded';
    touch('payments', p);
    const b = bookingById(a.p_booking)!;
    insert('wallet_ledger', { user_id: b.worker_id, amount: -b.amount, reason: 'refund_reversal', booking_id: b.id });
    notify(p.customer_id, 'Refund issued', `₹${p.amount}`, null);
    return null;
  },

  admin_dashboard_stats: (_a, uid) => {
    if (!isAdmin(uid)) fail('admin only');
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = start.toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const bookings = table('bookings');
    const pays = table('payments').filter((p) => p.status === 'success');
    const closed = bookings.filter((b) => !['requested', 'accepted', 'on_the_way', 'in_progress'].includes(b.status));
    const daily = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getTime() - (6 - i) * 86400_000);
      const from = d.toISOString();
      const to = new Date(d.getTime() + 86400_000).toISOString();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        day,
        jobs: table('jobs').filter((j) => j.created_at >= from && j.created_at < to).length,
        completed: bookings.filter((b) => b.status === 'completed' && b.check_out_at >= from && b.check_out_at < to).length,
      };
    });
    return {
      bookings_today: bookings.filter((b) => b.created_at >= today).length,
      jobs_today: table('jobs').filter((j) => j.created_at >= today).length,
      active_jobs: bookings.filter((b) => ['accepted', 'on_the_way', 'in_progress'].includes(b.status)).length,
      open_requests: table('jobs').filter((j) => j.status === 'open').length,
      revenue_today: pays.filter((p) => p.created_at >= today).reduce((s, p) => s + p.amount, 0),
      revenue_total: pays.reduce((s, p) => s + p.amount, 0),
      platform_fees_total: bookings.filter((b) => b.paid_at).reduce((s, b) => s + b.platform_fee, 0),
      new_workers: table('worker_profiles').filter((w) => w.created_at >= weekAgo).length,
      pending_workers: table('worker_profiles').filter((w) => w.status === 'pending').length,
      workers_online: table('worker_profiles').filter((w) => w.available && w.verified).length,
      customers: table('profiles').filter((p) => p.role === 'customer').length,
      open_complaints: table('complaints').filter((c) => ['open', 'in_review'].includes(c.status)).length,
      completion_rate: closed.length ? Math.round((100 * closed.filter((b) => b.status === 'completed').length) / closed.length) : 0,
      daily,
    };
  },
};

export function runRpc(fn: string, args: Args, uid: string | null) {
  const impl = fns[fn] ?? fail(`unknown function ${fn}`);
  changes = new Map();
  try {
    const result = impl(args, uid);
    return result;
  } finally {
    // Like a transaction that already applied: announce whatever changed (errors change nothing
    // except wrong-OTP counters, which are written before returning).
    commit([...changes.entries()].map(([t, rows]) => ({ table: t, rows })));
  }
}
