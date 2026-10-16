// Seeds the demo: 1 admin, 3 customers, 14 workers (12 verified, 2 pending), 8 trades,
// and sample jobs in every state. Safe to re-run: it rebuilds the demo jobs each time.
// Usage: npm run db:seed   (reads .env.local)
import { createClient } from '@supabase/supabase-js';
import { DEMO_OTP } from '../src/lib/demo';
import { admin, categories, customers, workers, type Person } from '../src/lib/demo-data';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });


async function must<R extends { data: unknown; error: { message: string } | null }>(
  p: PromiseLike<R>, what: string,
): Promise<NonNullable<R['data']>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<R['data']>;
}

async function ensureUser(p: Person): Promise<string> {
  const existing = await findUserByPhone(p.phone);
  const id = existing ?? (await must(db.auth.admin.createUser({ phone: `+${p.phone}`, phone_confirm: true }), `create ${p.name}`)).user!.id;
  await must(db.from('profiles').upsert({
    id, phone: p.phone, role: p.role, full_name: p.name, language: p.lang ?? 'en', onboarded: true,
  }), `profile ${p.name}`);
  return id;
}

let userCache: Map<string, string> | null = null;
async function findUserByPhone(phone: string): Promise<string | undefined> {
  if (!userCache) {
    userCache = new Map();
    for (let page = 1; ; page++) {
      const { users } = await must(db.auth.admin.listUsers({ page, perPage: 200 }), 'list users');
      users.forEach((u) => u.phone && userCache!.set(u.phone, u.id));
      if (users.length < 200) break;
    }
  }
  return userCache.get(phone);
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

async function main() {
  console.log('categories…');
  await must(db.from('categories').upsert(categories, { onConflict: 'slug' }), 'categories');
  const cats = await must(db.from('categories').select('id, slug, daily_rate, hourly_rate'), 'read categories');
  const cat = (slug: string) => cats.find((c) => c.slug === slug)!;

  console.log('users…');
  const adminId = await ensureUser(admin);
  const cust: Record<string, string> = {};
  for (const c of customers) cust[c.name] = await ensureUser(c);
  const wk: Record<string, string> = {};
  for (const x of workers) {
    const id = await ensureUser(x);
    wk[x.name] = id;
    await must(db.from('worker_profiles').upsert({
      user_id: id, category_ids: x.cats.map((s) => cat(s).id), bio: x.bio, experience_years: x.exp,
      home_area: x.area, status: x.status, available: x.available, rating_avg: x.rating,
      rating_count: x.count, jobs_completed: x.jobs,
    }), `worker ${x.name}`);
    await must(db.from('worker_private').upsert({
      user_id: id, home_lat: x.lat, home_lng: x.lng, id_doc_type: 'Aadhaar Card',
      bank_name: 'State Bank of India', bank_account_last4: String(1000 + workers.indexOf(x) * 37).slice(-4),
      upi_id: x.upi,
    }), `worker private ${x.name}`);
  }

  console.log('demo jobs…');
  const customerIds = Object.values(cust);
  await must(db.from('jobs').delete().in('customer_id', customerIds), 'clear jobs');
  await must(db.from('notifications').delete().in('user_id', [adminId, ...customerIds, ...Object.values(wk)]), 'clear notifications');
  await must(db.from('wallet_ledger').delete().in('user_id', Object.values(wk)), 'clear ledger');

  const fee = 25;
  type JobIn = {
    customer: string; slug: string; type: 'quick' | 'daily'; title: string; description: string;
    address: string; area: string; lat: number; lng: number; start: string; minutes: number; workers: number;
    status: string; created: string;
  };
  async function job(j: JobIn) {
    const c = cat(j.slug);
    const rate = j.minutes >= 480 ? c.daily_rate * Math.ceil(j.minutes / 480) : Math.ceil((c.hourly_rate * j.minutes) / 60);
    const row = await must(db.from('jobs').insert({
      customer_id: cust[j.customer], category_id: c.id, job_type: j.type, title: j.title, description: j.description,
      address: j.address, area: j.area, lat: j.lat, lng: j.lng, start_at: j.start, duration_minutes: j.minutes,
      workers_needed: j.workers, rate_per_worker: rate, platform_fee: fee, status: j.status, created_at: j.created,
    }).select('id, rate_per_worker').single(), `job ${j.title}`);
    return row as { id: string; rate_per_worker: number };
  }
  type BookingIn = {
    jobId: string; customer: string; worker: string; status: string; amount: number; at: number; minutes?: number; paid?: boolean;
  };
  async function booking(b: BookingIn) {
    const t = (offset: number) => hoursAgo(b.at - offset);
    const started = ['in_progress', 'completed'].includes(b.status);
    const done = b.status === 'completed';
    const row = await must(db.from('bookings').insert({
      job_id: b.jobId, customer_id: cust[b.customer], worker_id: wk[b.worker], status: b.status, amount: b.amount,
      platform_fee: fee, created_at: t(0), responded_at: t(0.05),
      on_the_way_at: started || b.status === 'on_the_way' ? t(0.2) : null,
      check_in_at: started ? t(0.5) : null,
      check_out_at: done ? t(0.5 + (b.minutes ?? 60) / 60) : null,
      paid_at: b.paid ? t(0.6 + (b.minutes ?? 60) / 60) : null,
    }).select('id').single(), 'booking') as { id: string };
    if (started) {
      await must(db.from('attendance_logs').insert([
        { booking_id: row.id, kind: 'in', at: t(0.5) },
        ...(done ? [{ booking_id: row.id, kind: 'out', at: t(0.5 + (b.minutes ?? 60) / 60) }] : []),
      ]), 'attendance');
    }
    if (b.paid) {
      await must(db.from('payments').insert({
        job_id: b.jobId, booking_id: row.id, customer_id: cust[b.customer], gateway_order_id: `order_mock_seed${row.id.slice(0, 6)}`,
        gateway_payment_id: `pay_mock_seed${row.id.slice(0, 6)}`, amount: b.amount + fee, status: 'success',
        created_at: t(0.6 + (b.minutes ?? 60) / 60),
      }), 'payment');
      await must(db.from('wallet_ledger').insert({
        user_id: wk[b.worker], amount: b.amount, reason: 'job_payment', booking_id: row.id, created_at: t(0.6 + (b.minutes ?? 60) / 60),
      }), 'ledger');
    }
    return row.id;
  }
  async function review(bookingId: string, from: string, to: string, rating: number, comment: string) {
    await must(db.from('reviews').insert({ booking_id: bookingId, from_user: from, to_user: to, rating, comment }), 'review');
  }

  // 1. Completed and paid quick job, 2 workers, reviewed.
  const j1 = await job({ customer: 'Amit Sharma', slug: 'loading', type: 'quick', title: 'Unload goods from vehicle',
    description: 'Need 2 workers to unload household items from a truck', address: 'Plot 14, Transport Nagar, Jaipur',
    area: 'Transport Nagar', lat: 26.8984, lng: 75.8382, start: hoursAgo(72), minutes: 60, workers: 2,
    status: 'completed', created: hoursAgo(72.2) });
  const b1 = await booking({ jobId: j1.id, customer: 'Amit Sharma', worker: 'Ramesh Yadav', status: 'completed', amount: j1.rate_per_worker, at: 72, paid: true });
  const b2 = await booking({ jobId: j1.id, customer: 'Amit Sharma', worker: 'Sohan Kumar', status: 'completed', amount: j1.rate_per_worker, at: 72, paid: true });
  await review(b1, cust['Amit Sharma'], wk['Ramesh Yadav'], 5, 'Very careful with the furniture, on time.');
  await review(b2, cust['Amit Sharma'], wk['Sohan Kumar'], 4, 'Good work.');
  await review(b1, wk['Ramesh Yadav'], cust['Amit Sharma'], 5, 'Clear instructions, paid quickly.');

  // 2. Completed and paid direct (daily) booking.
  const j2 = await job({ customer: 'Amit Sharma', slug: 'painter', type: 'daily', title: 'Painter',
    description: 'Paint 2 bedrooms, paint supplied', address: '22 Vidhyadhar Nagar, Jaipur', area: 'Vidhyadhar Nagar',
    lat: 26.9560, lng: 75.7780, start: hoursAgo(170), minutes: 480, workers: 1, status: 'completed', created: hoursAgo(175) });
  const b3 = await booking({ jobId: j2.id, customer: 'Amit Sharma', worker: 'Dinesh Kumawat', status: 'completed', amount: j2.rate_per_worker, at: 170, minutes: 480, paid: true });
  await review(b3, cust['Amit Sharma'], wk['Dinesh Kumawat'], 5, 'Neat finish, cleaned up after.');

  // 3. Completed and paid plumber job (with a complaint).
  const j3 = await job({ customer: 'Priya Verma', slug: 'plumber', type: 'quick', title: 'Fix kitchen tap leak',
    description: 'Kitchen tap leaking, bring basic tools', address: 'B-45 Malviya Nagar, Jaipur', area: 'Malviya Nagar',
    lat: 26.8530, lng: 75.8210, start: hoursAgo(48), minutes: 60, workers: 1, status: 'completed', created: hoursAgo(48.3) });
  const b4 = await booking({ jobId: j3.id, customer: 'Priya Verma', worker: 'Vikram Singh', status: 'completed', amount: j3.rate_per_worker, at: 48, paid: true });
  await review(b4, cust['Priya Verma'], wk['Vikram Singh'], 3, 'Fixed it but arrived 40 minutes late.');
  await must(db.from('complaints').insert({ job_id: j3.id, booking_id: b4, raised_by: cust['Priya Verma'],
    topic: 'Worker arrived late', description: 'Worker came 40 minutes after the start time without calling.', priority: 'medium' }), 'complaint');

  // 4. In progress: mason job today.
  const j4 = await job({ customer: 'Rohit Gupta', slug: 'mason', type: 'daily', title: 'Mason',
    description: 'Boundary wall repair, about 10 ft', address: '7 Sector 3, Mansarovar, Jaipur', area: 'Mansarovar',
    lat: 26.8550, lng: 75.7650, start: hoursAgo(2), minutes: 480, workers: 1, status: 'in_progress', created: hoursAgo(3) });
  await booking({ jobId: j4.id, customer: 'Rohit Gupta', worker: 'Suresh Saini', status: 'in_progress', amount: j4.rate_per_worker, at: 2.5, minutes: 480 });

  // 5. Open quick job, 1 of 2 filled.
  const j5 = await job({ customer: 'Priya Verma', slug: 'cleaning', type: 'quick', title: 'Deep clean 2BHK flat',
    description: 'Kitchen and bathrooms, bring cleaning supplies if possible', address: 'Flat 302, Raja Park, Jaipur',
    area: 'Raja Park', lat: 26.8960, lng: 75.8290, start: hoursAgo(-2), minutes: 180, workers: 2, status: 'open', created: hoursAgo(0.3) });
  await booking({ jobId: j5.id, customer: 'Priya Verma', worker: 'Sunita Devi', status: 'accepted', amount: j5.rate_per_worker, at: 0.2 });

  // 6. Open quick job with no workers yet — shows up for loading workers nearby.
  await job({ customer: 'Rohit Gupta', slug: 'loading', type: 'quick', title: 'Load furniture into tempo',
    description: 'Shifting house, 3rd floor, no lift', address: 'Near Sodala Circle, Jaipur', area: 'Sodala',
    lat: 26.9010, lng: 75.7750, start: hoursAgo(-1), minutes: 120, workers: 3, status: 'open', created: hoursAgo(0.1) });

  // 7. Cancelled.
  await job({ customer: 'Amit Sharma', slug: 'electrician', type: 'quick', title: 'Install ceiling fan',
    description: '', address: 'Plot 14, Transport Nagar, Jaipur', area: 'Transport Nagar', lat: 26.8984, lng: 75.8382,
    start: hoursAgo(30), minutes: 60, workers: 1, status: 'cancelled', created: hoursAgo(31) });

  const all = [admin, ...customers, ...workers];
  console.log('\nDone. Add these test numbers in Supabase → Authentication → Sign In / Providers → Phone → Test OTPs:\n');
  console.log(all.map((p) => `${p.phone}=${DEMO_OTP}`).join(','));
  console.log('\nLogins (OTP ' + DEMO_OTP + '):');
  all.forEach((p) => console.log(`  ${p.role.padEnd(8)} +${p.phone}  ${p.name}${'status' in p && p.status === 'pending' ? ' (pending)' : ''}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
