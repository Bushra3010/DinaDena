# DiNaDeNa — Chowk to Home

Demo build of the DiNaDeNa customer app, worker app and admin panel. It follows the client's PRD and the three design boards
(customer, worker, admin), which are kept outside this repo. Everything is one Next.js app backed by Supabase.

| Area | Routes | Design board |
|---|---|---|
| Welcome, language, OTP login, onboarding | `/welcome`, `/login`, `/onboarding` | PRD screens 01–02 |
| Customer app (mobile layout) | `/c/*` | Customer app board |
| Worker app (mobile layout) | `/w/*` | Worker app board |
| Admin console (desktop) | `/admin/*` | Admin board |

## How it works

- **Client-rendered pages + Supabase.** Pages talk to Supabase directly with the anon key.
  Every table has row level security.
- **Sensitive steps run inside Postgres.** OTP, pricing, accepting jobs, payments and reviews
  are `SECURITY DEFINER` functions in [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql).
  The client never writes `payments`, `attendance_logs`, `wallet_ledger` or a booking status.
  It only calls functions such as `accept_job`, `verify_attendance_otp` and `mock_pay_job`.
- **Capacitor-ready.** No page needs a Node server, so the Android build can wrap this app with Capacitor.
- **Realtime.** Booking status, job slots, worker location and notifications update live
  through Supabase Realtime, and RLS filters what each user receives.

### Booking flows

1. **Quick job (designs):** the customer posts a job needing N workers.
   - Verified, available workers within the search radius (10 km by default) get notified.
   - Each worker who accepts takes one slot (`accept_job`).
2. **Daily worker (PRD 05–07):** the customer searches workers by trade, distance, rating and rate,
   opens a profile, and books one worker (`book_worker`).
   - The worker has 10 minutes to accept or decline; after that the request expires.
3. **Shared steps after acceptance:**
   - The worker taps "I'm on the way" and a live map shows their position.
   - The customer shows a 4-digit **Start OTP**; the worker enters it to check in.
   - The worker can ask for extra time, which the customer approves or rejects.
   - The customer shows an **End OTP**; the worker enters it to check out.
   - The customer pays on the dummy UPI screen and both sides leave reviews.

**How the server works out the bill:**
- The amount is at least the booked time.
- Overtime is charged only up to the extra time the customer approved.
- Quick jobs use the category's hourly rate.
- Jobs of 8 hours or more use the daily rate (the admin's per-worker override if set).
- A platform fee is added per worker.

## Quick start: demo mode (no backend)

```bash
npm install
npm run dev
```

With no Supabase keys in `.env.local`, the app runs on a built-in mock backend (`src/lib/mock/`).
- **Data:** demo data is seeded and saved in your browser's localStorage. "Reset demo data" on the login screen restores it.
- **Logins:** each browser tab keeps its own login. Open the customer, the worker and the admin in separate tabs; changes show up live in the other tabs.
- **OTP:** any 10-digit number works with OTP `123456`. New numbers go through onboarding.
- **Same rules as Supabase:** the mock re-implements every database function from the migration (pricing, slots, OTP lockout, payments, reviews).

- **New workers:** they start "under verification", as the PRD requires, and can't go online until an admin approves them (Admin → Workers → Pending). In demo mode, the worker home also offers an **Approve me now (demo)** shortcut.

Add the Supabase keys below and the app switches to the real backend automatically.

### Tests

`npm run test:e2e` runs the full feature walkthrough in headless Chromium against the demo backend.
- **Setup:** start the app first with `npm run dev -- -p 3001`.
- **Coverage:** 37 checks across customer, worker and admin, including new-user onboarding, OTP lockout, payment failure and expiry.
- **Failures:** screenshots go to `tests/output/`.

## Setup with Supabase

1. **Create a free Supabase project** (Mumbai region is closest).
2. **Configure environment.** Run `cp .env.example .env.local`, then fill in:
   - The URL, anon key and service-role key (Project Settings → API).
   - `DATABASE_URL` (Project Settings → Database → Connection string → URI, session pooler).
3. **Install and set up the database:**
   ```bash
   npm install
   npm run db:migrate   # applies supabase/migrations/*.sql
   npm run db:seed      # demo users, 8 trades, 14 workers, sample jobs
   ```
   On Node 20 the seed script needs `NODE_OPTIONS=--experimental-websocket`. Node 22+ needs nothing extra.
4. **Turn on phone login** (Authentication → Sign In / Providers → Phone):
   - Enable the Phone provider.
   - Pick Twilio as the SMS provider. Placeholder values are fine for the demo.
   - Under **Test OTPs**, paste the line `db:seed` printed. Every demo number uses the fixed OTP `123456`, so no SMS is sent.
5. **Start the app:** `npm run dev`, then open http://localhost:3000.

With `NEXT_PUBLIC_DEMO_MODE=true`, the login screen lists one-tap demo logins.

### Demo logins (OTP 123456)

| Role | Phone | Notes |
|---|---|---|
| Customer | 99999 00001 | Amit Sharma: has paid, completed and cancelled jobs |
| Customer | 99999 00002 | Priya Verma: open cleaning job, complaint on file |
| Worker | 99999 10001 | Ramesh Yadav: loading, Transport Nagar |
| Worker | 99999 10002 | Sohan Kumar: loading, Sodala |
| Worker | 99999 10011 | Sunita Devi: cleaning |
| Worker | 99999 10013 | Pappu Ram: **pending verification** (for the admin approval demo) |
| Admin | 99999 00000 | |

## Android app (Capacitor)

The Android app is a Capacitor shell that loads the hosted web app, so web deploys reach the app without a new APK.

1. Deploy the web app (for example on Vercel) and note its URL.
2. Install a JDK 21 and Android Studio.
3. Sync and open the project:
   ```bash
   CAP_SERVER_URL=https://your-deployed-url npm run android:sync
   npm run android:open    # build / run from Android Studio
   ```

`capacitor/www/` holds only the offline fallback page.

## Demo script (PRD "demo is done when…")

Use two browser windows: a normal one and a private one.

1. **Customer** (Amit, normal window):
   - Choose a language, log in, and tap **Quick Jobs**.
   - Post "Loading & Unloading" with 2 workers, 1 hour, area Transport Nagar.
   - The radar screen appears.
2. **Worker** (Ramesh, private window):
   - A "New quick job nearby!" popup appears → **Accept Job**.
   - Do the same as Sohan for the second slot, or leave it at 1 of 2.
3. Ramesh taps **I'm on the way**:
   - His pin moves along a simulated route on the customer's map.
   - Real GPS is used instead when the device is in Jaipur.
4. **Check-in:**
   - Customer taps **Show OTP** (Start).
   - Ramesh types it → **Check In & Start Job**. The timer starts on both sides.
5. **Extra time and check-out:**
   - Optionally, Ramesh taps **Request Extra Time** and the customer approves it.
   - Customer shows the End OTP; Ramesh enters it → **End Work**.
6. **Customer pays and reviews:**
   - **Pay** → dummy UPI → **Simulate success**. A receipt is shown.
   - Rate the worker. Ramesh's earnings update.
7. **Admin:**
   - **Workers → Pending → Review** Pappu Ram → **Approve**.
   - **Categories & Pricing** → edit a daily rate.
   - The dashboard, live requests, job timeline, payments, complaints and CSV reports all show the demo data.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply SQL migrations (tracked in `public._migrations`) |
| `npm run db:seed` | Rebuild demo data (safe to re-run) |

## Where this differs from the PRD, and why

- **Distance search** uses a plain-SQL haversine function (`distance_km`) instead of PostGIS.
  It is fast enough at city scale, and it let the schema be tested in PGlite. Switching to
  PostGIS `geography` later is a local change to the search functions.
- **Attendance OTP hashes** live in `booking_otps`, a table with RLS on and no policies,
  not as a column on `bookings`. A 4-digit hash a worker could read would be trivial to brute force.
- **Login lock** (3 wrong OTPs → 15 minutes) is enforced per number in the app.
  Supabase Auth also rate-limits verification server-side. A strict server lock needs the
  custom SMS hook planned for the live provider.
- **Maps** use Leaflet with OpenStreetMap tiles, so the demo needs no API key.
  Google Maps can replace `src/components/MapInner.tsx` later.
- **Server functions** are Postgres functions rather than Edge Functions. Razorpay order creation
  and webhook verification will be Edge Functions that make the same updates as `mock_pay_job`.

## Still open (from PRD §10)

- **Cancellation after acceptance:** fee, refund or penalty? Today a customer can cancel only before any worker is on the way, with no fee.
- **Customer wallet:** real balance with top-up, or UPI at payment time only? The demo pays per job; `wallet_ledger` holds worker earnings.
- **Launch cities:** the demo is set up for Jaipur (`src/lib/geo.ts`).
- **Still to build:** a signed Android release (the Capacitor shell is set up), push notifications, live SMS, Razorpay.

## Project layout

```
supabase/migrations/   schema, RLS, functions (0001), realtime + storage buckets (0002)
scripts/               migrate.ts, seed.ts
src/lib/               supabase client, auth, i18n (English + Hindi), hooks, geo, types
src/components/        UI kit, maps, shells, worker background tasks, admin pieces
src/app/c|w|admin/     customer, worker and admin screens
android/, capacitor/   Capacitor Android shell and its offline fallback page
```
