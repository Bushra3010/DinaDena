// Builds the same demo data as scripts/seed.ts, for the in-browser mock backend.

import { admin, categories as CATS, customers, workers, type Person } from '../demo-data';
import { uuid, type Row, type Tables } from './store';

const FEE = 25;

export function buildSeed(): Tables {
  let n = 0;
  const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const t: Tables = {
    users: [], profiles: [], categories: [], app_settings: [], worker_profiles: [], worker_private: [], jobs: [],
    bookings: [], booking_otps: [], attendance_logs: [], worker_locations: [], payments: [], wallet_ledger: [],
    reviews: [], notifications: [], complaints: [],
  };
  const stamp = (r: Row, at = ago(400)): Row => ({ created_at: at, updated_at: at, ...r });

  t.app_settings!.push(stamp({ id: 1, platform_fee_per_worker: FEE, request_timeout_minutes: 10, search_radius_km: 10 }));
  for (const c of CATS) t.categories!.push(stamp({ id: uuid(), active: true, ...c }));
  const cat = (slug: string) => t.categories!.find((c) => c.slug === slug)!;

  const person = (p: Person, at = ago(500)) => {
    const uid = uuid();
    t.users!.push({ id: uid, phone: p.phone });
    t.profiles!.push(stamp({
      id: uid, role: p.role, full_name: p.name, phone: p.phone, language: p.lang ?? 'en', avatar_url: null,
      city: 'Jaipur', onboarded: true,
    }, at));
    return uid;
  };
  person(admin);
  const cust: Record<string, string> = {};
  for (const c of customers) cust[c.name] = person(c);
  const wk: Record<string, string> = {};
  workers.forEach((x, i) => {
    const at = x.status === 'pending' ? ago(20 + i) : ago(600);
    const uid = person(x, at);
    wk[x.name] = uid;
    t.worker_profiles!.push(stamp({
      user_id: uid, category_ids: x.cats.map((s) => cat(s).id), bio: x.bio, experience_years: x.exp, home_area: x.area,
      status: x.status, verified: x.status === 'approved', available: x.available, daily_rate: null,
      rating_avg: x.rating, rating_count: x.count, jobs_completed: x.jobs, rejection_reason: null,
    }, at));
    t.worker_private!.push(stamp({
      user_id: uid, home_lat: x.lat, home_lng: x.lng, id_doc_type: 'Aadhaar Card', id_doc_path: `seed/${uid}.svg`,
      bank_name: 'State Bank of India', bank_account_last4: String(1000 + i * 37).slice(-4), upi_id: x.upi,
    }, at));
  });

  let code = 100;
  const job = (j: {
    customer: string; slug: string; type: 'quick' | 'daily'; title: string; description: string; address: string;
    area: string; lat: number; lng: number; start: string; minutes: number; workers: number; status: string; created: string;
  }) => {
    const c = cat(j.slug);
    const rate = j.minutes >= 480 ? c.daily_rate * Math.ceil(j.minutes / 480) : Math.ceil((c.hourly_rate * j.minutes) / 60);
    const row = stamp({
      id: uuid(), code: `QK${++code}`, customer_id: cust[j.customer], category_id: c.id, job_type: j.type,
      title: j.title, description: j.description, address: j.address, area: j.area, lat: j.lat, lng: j.lng,
      start_at: j.start, duration_minutes: j.minutes, workers_needed: j.workers, rate_per_worker: rate,
      platform_fee: FEE, photo_url: null, status: j.status,
    }, j.created);
    t.jobs!.push(row);
    return row;
  };
  const booking = (b: { job: Row; worker: string; status: string; at: number; minutes?: number; paid?: boolean }) => {
    const tt = (o: number) => ago(b.at - o);
    const started = ['in_progress', 'completed'].includes(b.status);
    const done = b.status === 'completed';
    const m = (b.minutes ?? 60) / 60;
    const row = stamp({
      id: uuid(), job_id: b.job.id, customer_id: b.job.customer_id, worker_id: wk[b.worker], status: b.status,
      amount: b.job.rate_per_worker, platform_fee: FEE, expires_at: null, responded_at: tt(0.05),
      on_the_way_at: started || b.status === 'on_the_way' ? tt(0.2) : null, check_in_at: started ? tt(0.5) : null,
      check_out_at: done ? tt(0.5 + m) : null, paid_at: b.paid ? tt(0.6 + m) : null, cancelled_at: null,
      extra_minutes_requested: 0, extra_minutes_approved: 0,
    }, tt(0));
    t.bookings!.push(row);
    if (started) t.attendance_logs!.push(stamp({ id: uuid(), booking_id: row.id, kind: 'in', at: tt(0.5), lat: b.job.lat, lng: b.job.lng }, tt(0.5)));
    if (done) t.attendance_logs!.push(stamp({ id: uuid(), booking_id: row.id, kind: 'out', at: tt(0.5 + m), lat: b.job.lat, lng: b.job.lng }, tt(0.5 + m)));
    if (b.paid) {
      t.payments!.push(stamp({
        id: uuid(), job_id: b.job.id, booking_id: row.id, customer_id: b.job.customer_id, gateway: 'mock',
        gateway_order_id: `order_mock_seed${++n}`, gateway_payment_id: `pay_mock_seed${n}`, method: 'upi',
        amount: row.amount + FEE, status: 'success',
      }, tt(0.6 + m)));
      t.wallet_ledger!.push(stamp({ id: uuid(), user_id: row.worker_id, amount: row.amount, reason: 'job_payment', booking_id: row.id }, tt(0.6 + m)));
    }
    return row;
  };
  const review = (b: Row, from: string, to: string, rating: number, comment: string) =>
    t.reviews!.push(stamp({ id: uuid(), booking_id: b.id, from_user: from, to_user: to, rating, comment }, b.check_out_at ?? b.created_at));

  const j1 = job({ customer: 'Amit Sharma', slug: 'loading', type: 'quick', title: 'Unload goods from vehicle',
    description: 'Need 2 workers to unload household items from a truck', address: 'Plot 14, Transport Nagar, Jaipur',
    area: 'Transport Nagar', lat: 26.8984, lng: 75.8382, start: ago(72), minutes: 60, workers: 2, status: 'completed', created: ago(72.2) });
  const b1 = booking({ job: j1, worker: 'Ramesh Yadav', status: 'completed', at: 72, paid: true });
  const b2 = booking({ job: j1, worker: 'Sohan Kumar', status: 'completed', at: 72, paid: true });
  review(b1, cust['Amit Sharma']!, wk['Ramesh Yadav']!, 5, 'Very careful with the furniture, on time.');
  review(b2, cust['Amit Sharma']!, wk['Sohan Kumar']!, 4, 'Good work.');
  review(b1, wk['Ramesh Yadav']!, cust['Amit Sharma']!, 5, 'Clear instructions, paid quickly.');

  const j2 = job({ customer: 'Amit Sharma', slug: 'painter', type: 'daily', title: 'Painter', description: 'Paint 2 bedrooms, paint supplied',
    address: '22 Vidhyadhar Nagar, Jaipur', area: 'Vidhyadhar Nagar', lat: 26.956, lng: 75.778, start: ago(170), minutes: 480,
    workers: 1, status: 'completed', created: ago(175) });
  const b3 = booking({ job: j2, worker: 'Dinesh Kumawat', status: 'completed', at: 170, minutes: 480, paid: true });
  review(b3, cust['Amit Sharma']!, wk['Dinesh Kumawat']!, 5, 'Neat finish, cleaned up after.');

  const j3 = job({ customer: 'Priya Verma', slug: 'plumber', type: 'quick', title: 'Fix kitchen tap leak', description: 'Kitchen tap leaking, bring basic tools',
    address: 'B-45 Malviya Nagar, Jaipur', area: 'Malviya Nagar', lat: 26.853, lng: 75.821, start: ago(48), minutes: 60, workers: 1,
    status: 'completed', created: ago(48.3) });
  const b4 = booking({ job: j3, worker: 'Vikram Singh', status: 'completed', at: 48, paid: true });
  review(b4, cust['Priya Verma']!, wk['Vikram Singh']!, 3, 'Fixed it but arrived 40 minutes late.');
  t.complaints!.push(stamp({ id: uuid(), code: 'CMP20481', job_id: j3.id, booking_id: b4.id, raised_by: cust['Priya Verma'],
    topic: 'Worker arrived late', description: 'Worker came 40 minutes after the start time without calling.', priority: 'medium',
    status: 'open', admin_note: null, resolved_at: null }, ago(46)));

  const j4 = job({ customer: 'Rohit Gupta', slug: 'mason', type: 'daily', title: 'Mason', description: 'Boundary wall repair, about 10 ft',
    address: '7 Sector 3, Mansarovar, Jaipur', area: 'Mansarovar', lat: 26.855, lng: 75.765, start: ago(2), minutes: 480, workers: 1,
    status: 'in_progress', created: ago(3) });
  booking({ job: j4, worker: 'Suresh Saini', status: 'in_progress', at: 2.5, minutes: 480 });

  const j5 = job({ customer: 'Priya Verma', slug: 'cleaning', type: 'quick', title: 'Deep clean 2BHK flat',
    description: 'Kitchen and bathrooms, bring cleaning supplies if possible', address: 'Flat 302, Raja Park, Jaipur', area: 'Raja Park',
    lat: 26.896, lng: 75.829, start: ago(-2), minutes: 180, workers: 2, status: 'open', created: ago(0.3) });
  booking({ job: j5, worker: 'Sunita Devi', status: 'accepted', at: 0.2 });

  job({ customer: 'Rohit Gupta', slug: 'loading', type: 'quick', title: 'Load furniture into tempo', description: 'Shifting house, 3rd floor, no lift',
    address: 'Near Sodala Circle, Jaipur', area: 'Sodala', lat: 26.901, lng: 75.775, start: ago(-1), minutes: 120, workers: 3,
    status: 'open', created: ago(0.1) });

  job({ customer: 'Amit Sharma', slug: 'electrician', type: 'quick', title: 'Install ceiling fan', description: '',
    address: 'Plot 14, Transport Nagar, Jaipur', area: 'Transport Nagar', lat: 26.8984, lng: 75.8382, start: ago(30), minutes: 60,
    workers: 1, status: 'cancelled', created: ago(31) });

  return t;
}
