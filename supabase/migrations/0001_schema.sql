-- DiNaDeNa: core schema, row level security and server functions.
-- Every table has id/created_at/updated_at. Writes that touch money, OTP or
-- booking status go through SECURITY DEFINER functions, never direct inserts.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'worker', 'admin');
create type public.worker_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.job_type as enum ('quick', 'daily');
create type public.job_status as enum ('open', 'booked', 'in_progress', 'completed', 'cancelled');
create type public.booking_status as enum (
  'requested', 'accepted', 'rejected', 'expired', 'cancelled',
  'on_the_way', 'in_progress', 'completed'
);
create type public.payment_status as enum ('created', 'success', 'failed', 'refunded');
create type public.complaint_status as enum ('open', 'in_review', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Great-circle distance in km. Plain SQL so it runs without PostGIS.
create or replace function public.distance_km(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision language sql immutable parallel safe as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text,
  phone text,
  language text not null default 'en' check (language in ('en', 'hi')),
  avatar_url text,
  city text default 'Jaipur',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_hi text not null,
  icon text not null default 'hammer',
  daily_rate integer not null check (daily_rate > 0),   -- per worker per 8h day, set by admin
  hourly_rate integer not null check (hourly_rate > 0), -- per worker per hour for quick jobs
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  id integer primary key default 1 check (id = 1),
  platform_fee_per_worker integer not null default 25,
  request_timeout_minutes integer not null default 10,
  search_radius_km integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

-- Public part of a worker profile: readable by any signed-in user once approved.
create table public.worker_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  category_ids uuid[] not null default '{}',
  bio text,
  experience_years integer not null default 0,
  home_area text,
  status public.worker_status not null default 'pending',
  verified boolean generated always as (status = 'approved') stored,
  available boolean not null default false,
  daily_rate integer,                 -- admin-only override of the category rate
  rating_avg numeric(2, 1) not null default 0,
  rating_count integer not null default 0,
  jobs_completed integer not null default 0,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private part: location, identity and payout details. Owner and admin only.
create table public.worker_private (
  user_id uuid primary key references public.worker_profiles (user_id) on delete cascade,
  home_lat double precision,
  home_lng double precision,
  id_doc_type text,
  id_doc_path text,
  bank_name text,
  bank_account_last4 text,
  upi_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.job_code_seq start 101;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('QK' || nextval('public.job_code_seq')),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  job_type public.job_type not null default 'quick',
  title text not null,
  description text,
  address text not null,
  area text,
  lat double precision not null,
  lng double precision not null,
  start_at timestamptz not null default now(),
  duration_minutes integer not null check (duration_minutes between 30 and 14400),
  workers_needed integer not null default 1 check (workers_needed between 1 and 10),
  rate_per_worker integer not null,   -- server-computed labour estimate per worker
  platform_fee integer not null,      -- server-computed, per worker
  photo_url text,
  status public.job_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_customer_idx on public.jobs (customer_id, created_at desc);
create index jobs_open_idx on public.jobs (status, category_id) where status = 'open';

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  status public.booking_status not null,
  amount integer not null,            -- labour, final after check-out
  platform_fee integer not null,
  expires_at timestamptz,
  responded_at timestamptz,
  on_the_way_at timestamptz,
  check_in_at timestamptz,
  check_out_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  extra_minutes_requested integer not null default 0,
  extra_minutes_approved integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id)
);
create index bookings_customer_idx on public.bookings (customer_id, created_at desc);
create index bookings_worker_idx on public.bookings (worker_id, created_at desc);
create index bookings_job_idx on public.bookings (job_id);

-- Attendance OTP hashes live apart from bookings so no client can read them.
create table public.booking_otps (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  otp_hash text not null,
  attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_locations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index worker_locations_booking_idx on public.worker_locations (booking_id, recorded_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  gateway text not null default 'mock',
  gateway_order_id text,
  gateway_payment_id text,
  method text not null default 'upi',
  amount integer not null,
  status public.payment_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_job_idx on public.payments (job_id);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  reason text not null,
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wallet_ledger_user_idx on public.wallet_ledger (user_id, created_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, from_user)
);
create index reviews_to_user_idx on public.reviews (to_user, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  device_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('CMP' || lpad((floor(random() * 100000))::int::text, 5, '0')),
  job_id uuid references public.jobs (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  raised_by uuid not null references public.profiles (id) on delete cascade,
  topic text not null,
  description text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status public.complaint_status not null default 'open',
  admin_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['profiles','categories','app_settings','worker_profiles','worker_private',
    'jobs','bookings','booking_otps','attendance_logs','worker_locations','payments','wallet_ledger',
    'reviews','notifications','complaints']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- Names and avatars only: safe to show anyone signed in. Phones stay in profiles.
create view public.public_profiles as
  select id, role, full_name, avatar_url from public.profiles;

-- ---------------------------------------------------------------------------
-- Auth helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_verified_worker() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.worker_profiles where user_id = auth.uid() and verified)
$$;

create or replace function public.notify(p_user uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link) values (p_user, p_title, p_body, p_link)
$$;

-- New auth user -> profile row. Role always starts as customer; clients cannot pick admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Direct client writes run as anon/authenticated; server functions and the service role
-- run as another role, so the protect triggers below only police client writes.
create or replace function public.is_client_write() returns boolean
language sql stable as $$
  select current_user in ('anon', 'authenticated') and not public.is_admin()
$$;

-- Users may only pick customer/worker once, during onboarding.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_client_write() then
    return new;
  end if;
  if new.role is distinct from old.role then
    if old.onboarded or new.role not in ('customer', 'worker') then
      raise exception 'role cannot be changed';
    end if;
  end if;
  new.phone := old.phone;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Verification, rate and rating fields are admin/server only.
create or replace function public.protect_worker_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_client_write() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.daily_rate := null;
    new.rating_avg := 0;
    new.rating_count := 0;
    new.jobs_completed := 0;
    return new;
  end if;
  new.status := old.status;
  new.daily_rate := old.daily_rate;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.jobs_completed := old.jobs_completed;
  new.rejection_reason := old.rejection_reason;
  -- Unverified workers cannot go online.
  if new.status <> 'approved' then
    new.available := false;
  end if;
  return new;
end $$;
create trigger worker_profiles_protect before insert or update on public.worker_profiles
  for each row execute function public.protect_worker_fields();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.app_settings enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.worker_private enable row level security;
alter table public.jobs enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_otps enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.worker_locations enable row level security;
alter table public.payments enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.complaints enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy categories_select_anon on public.categories for select to anon using (active);
create policy categories_select on public.categories for select to authenticated
  using (active or public.is_admin());
create policy categories_admin on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy settings_select on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy worker_profiles_select on public.worker_profiles for select to authenticated
  using (verified or user_id = auth.uid() or public.is_admin());
create policy worker_profiles_insert on public.worker_profiles for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.profiles where id = auth.uid() and role = 'worker'));
create policy worker_profiles_update on public.worker_profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy worker_private_select on public.worker_private for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy worker_private_insert on public.worker_private for insert to authenticated
  with check (user_id = auth.uid());
create policy worker_private_update on public.worker_private for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- Jobs: owner, admin, workers with a booking on it, and verified workers while it is open.
create policy jobs_select on public.jobs for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
         or (status = 'open' and public.is_verified_worker())
         or exists (select 1 from public.bookings b where b.job_id = jobs.id and b.worker_id = auth.uid()));

create policy bookings_select on public.bookings for select to authenticated
  using (customer_id = auth.uid() or worker_id = auth.uid() or public.is_admin());

-- booking_otps: RLS on, no policies. Only server functions touch it.

create policy attendance_select on public.attendance_logs for select to authenticated
  using (public.is_admin() or exists (select 1 from public.bookings b where b.id = booking_id
         and (b.customer_id = auth.uid() or b.worker_id = auth.uid())));

create policy locations_select on public.worker_locations for select to authenticated
  using (worker_id = auth.uid() or public.is_admin() or exists (select 1 from public.bookings b
         where b.id = booking_id and b.customer_id = auth.uid()));
create policy locations_insert on public.worker_locations for insert to authenticated
  with check (worker_id = auth.uid() and exists (select 1 from public.bookings b
              where b.id = booking_id and b.worker_id = auth.uid()
              and b.status in ('on_the_way', 'in_progress')));

create policy payments_select on public.payments for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.bookings b where b.id = booking_id and b.worker_id = auth.uid()));

create policy ledger_select on public.wallet_ledger for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy reviews_select on public.reviews for select to authenticated using (true);

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create policy complaints_select on public.complaints for select to authenticated
  using (raised_by = auth.uid() or public.is_admin());
create policy complaints_insert on public.complaints for insert to authenticated
  with check (raised_by = auth.uid() and (job_id is null or public.is_admin() or exists (
    select 1 from public.jobs j where j.id = job_id and (j.customer_id = auth.uid()
      or exists (select 1 from public.bookings b where b.job_id = j.id and b.worker_id = auth.uid())))));
create policy complaints_admin on public.complaints for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------
-- Labour for one worker: hourly for short jobs, daily rate per 8h day for long ones.
create or replace function public.labour_amount(p_category uuid, p_worker uuid, p_minutes integer)
returns integer language sql stable security definer set search_path = public as $$
  select case
    when p_minutes >= 480 then
      coalesce((select daily_rate from public.worker_profiles where user_id = p_worker), c.daily_rate)
        * ceil(p_minutes / 480.0)::int
    else ceil(c.hourly_rate * p_minutes / 60.0)::int
  end
  from public.categories c where c.id = p_category
$$;

-- ---------------------------------------------------------------------------
-- Customer functions
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_requests() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with expired as (
    update public.bookings set status = 'expired', responded_at = now()
    where status = 'requested' and expires_at < now()
    returning job_id, customer_id
  )
  select count(*) into n from expired;
  -- Direct-booking jobs whose only request expired go back to cancelled.
  update public.jobs j set status = 'cancelled'
  where j.job_type = 'daily' and j.status = 'booked'
    and not exists (select 1 from public.bookings b where b.job_id = j.id
                    and b.status not in ('rejected', 'expired', 'cancelled'));
  return n;
end $$;

create or replace function public.search_workers(
  p_category uuid, p_lat double precision, p_lng double precision,
  p_radius_km double precision default 10, p_min_rating numeric default 0,
  p_max_rate integer default null, p_available_only boolean default false)
returns table (
  user_id uuid, full_name text, avatar_url text, category_ids uuid[], bio text,
  experience_years integer, home_area text, available boolean, rating_avg numeric,
  rating_count integer, jobs_completed integer, daily_rate integer, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select * from (
    select w.user_id, p.full_name, p.avatar_url, w.category_ids, w.bio, w.experience_years,
           w.home_area, w.available, w.rating_avg, w.rating_count, w.jobs_completed,
           coalesce(w.daily_rate, c.daily_rate) as daily_rate,
           round(public.distance_km(p_lat, p_lng, wp.home_lat, wp.home_lng)::numeric, 1)::double precision as distance_km
    from public.worker_profiles w
    join public.profiles p on p.id = w.user_id
    join public.worker_private wp on wp.user_id = w.user_id
    join public.categories c on c.id = p_category
    where w.verified and p_category = any (w.category_ids)
      and wp.home_lat is not null
      and (not p_available_only or w.available)
      and w.rating_avg >= coalesce(p_min_rating, 0)
  ) s
  where s.distance_km <= p_radius_km
    and (p_max_rate is null or s.daily_rate <= p_max_rate)
  order by s.distance_km, s.rating_avg desc
$$;

-- Distance from the caller (customer) to one worker plus the public card fields.
create or replace function public.get_worker_card(p_worker uuid, p_lat double precision, p_lng double precision)
returns table (
  user_id uuid, full_name text, avatar_url text, category_ids uuid[], bio text,
  experience_years integer, home_area text, available boolean, rating_avg numeric,
  rating_count integer, jobs_completed integer, daily_rate integer, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select w.user_id, p.full_name, p.avatar_url, w.category_ids, w.bio, w.experience_years,
         w.home_area, w.available, w.rating_avg, w.rating_count, w.jobs_completed,
         coalesce(w.daily_rate, (select c.daily_rate from public.categories c
                                 where c.id = w.category_ids[1])),
         round(public.distance_km(p_lat, p_lng, wp.home_lat, wp.home_lng)::numeric, 1)::double precision
  from public.worker_profiles w
  join public.profiles p on p.id = w.user_id
  join public.worker_private wp on wp.user_id = w.user_id
  where w.user_id = p_worker and w.verified
$$;

create or replace function public.price_quote(p_category uuid, p_minutes integer, p_workers integer,
                                              p_worker uuid default null)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'rate_per_worker', public.labour_amount(p_category, p_worker, p_minutes),
    'platform_fee', s.platform_fee_per_worker,
    'labour_total', public.labour_amount(p_category, p_worker, p_minutes) * p_workers,
    'fee_total', s.platform_fee_per_worker * p_workers,
    'total', (public.labour_amount(p_category, p_worker, p_minutes) + s.platform_fee_per_worker) * p_workers)
  from public.app_settings s where s.id = 1
$$;

-- Quick job: broadcast to nearby verified workers in the category.
create or replace function public.create_quick_job(
  p_category uuid, p_title text, p_description text, p_address text, p_area text,
  p_lat double precision, p_lng double precision, p_start_at timestamptz,
  p_duration_minutes integer, p_workers integer, p_photo_url text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_job uuid;
  v_fee integer;
  v_cat public.categories;
  w record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_cat from public.categories where id = p_category and active;
  if not found then raise exception 'unknown category'; end if;
  select platform_fee_per_worker into v_fee from public.app_settings where id = 1;

  insert into public.jobs (customer_id, category_id, job_type, title, description, address, area,
                           lat, lng, start_at, duration_minutes, workers_needed, rate_per_worker,
                           platform_fee, photo_url)
  values (auth.uid(), p_category, 'quick', coalesce(nullif(trim(p_title), ''), v_cat.name_en),
          p_description, p_address, p_area, p_lat, p_lng, coalesce(p_start_at, now()),
          p_duration_minutes, p_workers, public.labour_amount(p_category, null, p_duration_minutes),
          v_fee, p_photo_url)
  returning id into v_job;

  for w in
    select wp.user_id from public.worker_profiles wp
    join public.worker_private pr on pr.user_id = wp.user_id
    cross join public.app_settings s
    where wp.verified and wp.available and p_category = any (wp.category_ids) and s.id = 1
      and public.distance_km(p_lat, p_lng, pr.home_lat, pr.home_lng) <= s.search_radius_km
  loop
    perform public.notify(w.user_id, 'New quick job nearby', v_cat.name_en || ' · ' || coalesce(p_area, p_address),
                          '/w/jobs/' || v_job);
  end loop;
  return v_job;
end $$;

-- Direct booking of one worker (Daily Workers flow). Worker has N minutes to respond.
create or replace function public.book_worker(
  p_worker uuid, p_category uuid, p_description text, p_address text, p_area text,
  p_lat double precision, p_lng double precision, p_start_at timestamptz, p_duration_minutes integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_job uuid;
  v_booking uuid;
  v_amount integer;
  v_fee integer;
  v_timeout integer;
  v_cat public.categories;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_worker = auth.uid() then raise exception 'cannot book yourself'; end if;
  select * into v_cat from public.categories where id = p_category and active;
  if not found then raise exception 'unknown category'; end if;
  if not exists (select 1 from public.worker_profiles where user_id = p_worker and verified
                 and p_category = any (category_ids)) then
    raise exception 'worker not available for this category';
  end if;
  select platform_fee_per_worker, request_timeout_minutes into v_fee, v_timeout
  from public.app_settings where id = 1;
  v_amount := public.labour_amount(p_category, p_worker, p_duration_minutes);

  insert into public.jobs (customer_id, category_id, job_type, title, description, address, area,
                           lat, lng, start_at, duration_minutes, workers_needed, rate_per_worker,
                           platform_fee, status)
  values (auth.uid(), p_category, 'daily', v_cat.name_en, p_description, p_address, p_area, p_lat, p_lng,
          coalesce(p_start_at, now()), p_duration_minutes, 1, v_amount, v_fee, 'booked')
  returning id into v_job;

  insert into public.bookings (job_id, customer_id, worker_id, status, amount, platform_fee, expires_at)
  values (v_job, auth.uid(), p_worker, 'requested', v_amount, v_fee, now() + make_interval(mins => v_timeout))
  returning id into v_booking;

  perform public.notify(p_worker, 'New booking request', v_cat.name_en || ' · ' || coalesce(p_area, p_address),
                        '/w/bookings/' || v_booking);
  return v_job;
end $$;

create or replace function public.cancel_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not exists (select 1 from public.jobs where id = p_job and customer_id = auth.uid()) then
    raise exception 'not your job';
  end if;
  if exists (select 1 from public.bookings where job_id = p_job
             and status in ('on_the_way', 'in_progress', 'completed')) then
    raise exception 'job already started';
  end if;
  for b in select id, worker_id from public.bookings where job_id = p_job and status in ('requested', 'accepted') loop
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = b.id;
    perform public.notify(b.worker_id, 'Job cancelled', 'The customer cancelled this job', '/w/bookings/' || b.id);
  end loop;
  update public.jobs set status = 'cancelled' where id = p_job;
end $$;

-- Shows a fresh 4-digit attendance OTP to the customer. Only the hash is stored.
create or replace function public.issue_attendance_otp(p_booking uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_b public.bookings;
  v_kind text;
  v_otp text;
begin
  select * into v_b from public.bookings where id = p_booking and customer_id = auth.uid();
  if not found then raise exception 'not your booking'; end if;
  if v_b.status in ('accepted', 'on_the_way') then v_kind := 'in';
  elsif v_b.status = 'in_progress' then v_kind := 'out';
  else raise exception 'no attendance step for status %', v_b.status;
  end if;
  v_otp := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into public.booking_otps (booking_id, kind, otp_hash)
  values (p_booking, v_kind, encode(sha256(convert_to(p_booking::text || ':' || v_otp, 'UTF8')), 'hex'))
  on conflict (booking_id) do update set kind = excluded.kind, otp_hash = excluded.otp_hash,
    attempts = 0, locked_until = null;
  return json_build_object('otp', v_otp, 'kind', v_kind);
end $$;

create or replace function public.respond_extra_time(p_booking uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking and customer_id = auth.uid() for update;
  if not found then raise exception 'not your booking'; end if;
  if v_b.extra_minutes_requested <= 0 then raise exception 'no pending request'; end if;
  update public.bookings set
    extra_minutes_approved = extra_minutes_approved + case when p_approve then extra_minutes_requested else 0 end,
    extra_minutes_requested = 0
  where id = p_booking;
  perform public.notify(v_b.worker_id,
    case when p_approve then 'Extra time approved' else 'Extra time declined' end,
    null, '/w/bookings/' || p_booking);
end $$;

-- Dummy UPI gateway. Marks every completed, unpaid booking of the job paid (or failed).
-- Razorpay replaces this with order creation + a verified webhook using the same updates.
create or replace function public.mock_pay_job(p_job uuid, p_success boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  b record;
  v_total integer := 0;
  v_ref text := 'pay_mock_' || substr(md5(random()::text), 1, 14);
  v_order text := 'order_mock_' || substr(md5(random()::text), 1, 14);
  v_count integer := 0;
begin
  select * into v_job from public.jobs where id = p_job and customer_id = auth.uid() for update;
  if not found then raise exception 'not your job'; end if;

  for b in select * from public.bookings where job_id = p_job and status = 'completed' and paid_at is null for update loop
    v_count := v_count + 1;
    v_total := v_total + b.amount + b.platform_fee;
    insert into public.payments (job_id, booking_id, customer_id, gateway_order_id, gateway_payment_id, amount, status)
    values (p_job, b.id, auth.uid(), v_order, case when p_success then v_ref end, b.amount + b.platform_fee,
            case when p_success then 'success'::public.payment_status else 'failed'::public.payment_status end);
    if p_success then
      update public.bookings set paid_at = now() where id = b.id;
      insert into public.wallet_ledger (user_id, amount, reason, booking_id)
      values (b.worker_id, b.amount, 'job_payment', b.id);
      perform public.notify(b.worker_id, 'Payment received', '₹' || b.amount || ' · ' || v_job.code,
                            '/w/earnings');
    end if;
  end loop;

  if v_count = 0 then raise exception 'nothing to pay'; end if;

  if p_success and not exists (select 1 from public.bookings where job_id = p_job
                               and status not in ('completed', 'rejected', 'expired', 'cancelled')) then
    update public.jobs set status = 'completed' where id = p_job;
  end if;

  return json_build_object('success', p_success, 'amount', v_total, 'payment_ref', v_ref,
                           'order_id', v_order, 'paid_at', now());
end $$;

-- Either side reviews the other once per completed booking.
create or replace function public.submit_review(p_booking uuid, p_rating integer, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b public.bookings;
  v_to uuid;
begin
  select * into v_b from public.bookings where id = p_booking
    and (customer_id = auth.uid() or worker_id = auth.uid());
  if not found then raise exception 'not your booking'; end if;
  if v_b.status <> 'completed' then raise exception 'booking not completed'; end if;
  v_to := case when v_b.customer_id = auth.uid() then v_b.worker_id else v_b.customer_id end;
  insert into public.reviews (booking_id, from_user, to_user, rating, comment)
  values (p_booking, auth.uid(), v_to, p_rating, nullif(trim(p_comment), ''));
  if v_to = v_b.worker_id then
    update public.worker_profiles w set
      rating_count = s.n, rating_avg = round(s.avg_rating, 1)
    from (select count(*) n, avg(rating) avg_rating from public.reviews where to_user = v_to) s
    where w.user_id = v_to;
  end if;
end $$;

-- Phone numbers are shown only once a booking is accepted and still active.
create or replace function public.get_contact_phone(p_booking uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.phone from public.bookings b
  join public.profiles p on p.id = case when b.customer_id = auth.uid() then b.worker_id else b.customer_id end
  where b.id = p_booking and (b.customer_id = auth.uid() or b.worker_id = auth.uid())
    and b.status in ('accepted', 'on_the_way', 'in_progress')
$$;

-- ---------------------------------------------------------------------------
-- Worker functions
-- ---------------------------------------------------------------------------
create or replace function public.nearby_open_jobs(p_radius_km double precision default 10)
returns table (
  id uuid, code text, title text, description text, category_id uuid, area text, address text,
  lat double precision, lng double precision, start_at timestamptz, duration_minutes integer,
  workers_needed integer, slots_filled integer, rate_per_worker integer, photo_url text,
  customer_name text, distance_km double precision, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select j.id, j.code, j.title, j.description, j.category_id, j.area, j.address, j.lat, j.lng, j.start_at,
         j.duration_minutes, j.workers_needed,
         (select count(*)::int from public.bookings b where b.job_id = j.id
          and b.status in ('accepted', 'on_the_way', 'in_progress', 'completed')),
         j.rate_per_worker, j.photo_url, cp.full_name,
         round(public.distance_km(pr.home_lat, pr.home_lng, j.lat, j.lng)::numeric, 1)::double precision as d,
         j.created_at
  from public.jobs j
  join public.profiles cp on cp.id = j.customer_id
  join public.worker_profiles w on w.user_id = auth.uid()
  join public.worker_private pr on pr.user_id = auth.uid()
  where w.verified and j.status = 'open' and j.job_type = 'quick'
    and j.category_id = any (w.category_ids)
    and j.customer_id <> auth.uid()
    and not exists (select 1 from public.bookings b where b.job_id = j.id and b.worker_id = auth.uid())
    and public.distance_km(pr.home_lat, pr.home_lng, j.lat, j.lng) <= p_radius_km
  order by d
$$;

-- Worker takes one slot of an open quick job.
create or replace function public.accept_job(p_job uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_filled integer;
  v_booking uuid;
begin
  if not public.is_verified_worker() then raise exception 'worker not verified'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found or v_job.status <> 'open' then raise exception 'job is no longer open'; end if;
  if v_job.customer_id = auth.uid() then raise exception 'cannot accept your own job'; end if;
  if not exists (select 1 from public.worker_profiles where user_id = auth.uid()
                 and v_job.category_id = any (category_ids)) then
    raise exception 'job is not in your skills';
  end if;
  select count(*) into v_filled from public.bookings where job_id = p_job
    and status in ('accepted', 'on_the_way', 'in_progress', 'completed');
  if v_filled >= v_job.workers_needed then raise exception 'all slots are filled'; end if;

  insert into public.bookings (job_id, customer_id, worker_id, status, amount, platform_fee, responded_at)
  values (p_job, v_job.customer_id, auth.uid(), 'accepted', v_job.rate_per_worker, v_job.platform_fee, now())
  returning id into v_booking;

  if v_filled + 1 >= v_job.workers_needed then
    update public.jobs set status = 'booked' where id = p_job;
  end if;
  perform public.notify(v_job.customer_id, 'Worker accepted your job',
                        (v_filled + 1) || ' of ' || v_job.workers_needed || ' workers confirmed', '/c/jobs/' || p_job);
  return v_booking;
end $$;

-- Worker answers a direct booking request within the timeout.
create or replace function public.respond_booking(p_booking uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  perform public.expire_stale_requests();
  select * into v_b from public.bookings where id = p_booking and worker_id = auth.uid() for update;
  if not found then raise exception 'not your booking'; end if;
  if v_b.status <> 'requested' then raise exception 'request is %', v_b.status; end if;
  update public.bookings set status = case when p_accept then 'accepted'::public.booking_status
                                          else 'rejected'::public.booking_status end,
    responded_at = now()
  where id = p_booking;
  if not p_accept then
    update public.jobs set status = 'cancelled' where id = v_b.job_id and job_type = 'daily';
  end if;
  perform public.notify(v_b.customer_id,
    case when p_accept then 'Booking accepted' else 'Booking declined' end,
    null, '/c/jobs/' || v_b.job_id);
end $$;

create or replace function public.start_trip(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking and worker_id = auth.uid() for update;
  if not found then raise exception 'not your booking'; end if;
  if v_b.status <> 'accepted' then raise exception 'booking is %', v_b.status; end if;
  update public.bookings set status = 'on_the_way', on_the_way_at = now() where id = p_booking;
  perform public.notify(v_b.customer_id, 'Worker is on the way', null, '/c/jobs/' || v_b.job_id);
end $$;

-- Worker enters the customer's OTP. Check-in starts work, check-out completes it and
-- fixes the amount: the booked time, plus worked overtime up to what the customer approved.
create or replace function public.verify_attendance_otp(p_booking uuid, p_otp text,
                                                        p_lat double precision default null,
                                                        p_lng double precision default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_b public.bookings;
  v_job public.jobs;
  v_otp public.booking_otps;
  v_worked integer;
  v_billed integer;
  v_amount integer;
begin
  select * into v_b from public.bookings where id = p_booking and worker_id = auth.uid() for update;
  if not found then raise exception 'not your booking'; end if;
  select * into v_otp from public.booking_otps where booking_id = p_booking for update;
  if not found then
    return json_build_object('ok', false, 'error', 'otp_not_issued');
  end if;
  if v_otp.locked_until is not null and v_otp.locked_until > now() then
    return json_build_object('ok', false, 'error', 'locked', 'locked_until', v_otp.locked_until);
  end if;
  if v_otp.otp_hash <> encode(sha256(convert_to(p_booking::text || ':' || coalesce(p_otp, ''), 'UTF8')), 'hex') then
    update public.booking_otps set attempts = attempts + 1,
      locked_until = case when attempts + 1 >= 3 then now() + interval '15 minutes' end
    where booking_id = p_booking;
    return json_build_object('ok', false, 'error', 'wrong_otp', 'attempts_left', greatest(0, 2 - v_otp.attempts));
  end if;

  select * into v_job from public.jobs where id = v_b.job_id;

  if v_otp.kind = 'in' then
    if v_b.status not in ('accepted', 'on_the_way') then
      return json_build_object('ok', false, 'error', 'bad_status');
    end if;
    insert into public.attendance_logs (booking_id, kind, lat, lng) values (p_booking, 'in', p_lat, p_lng);
    update public.bookings set status = 'in_progress', check_in_at = now() where id = p_booking;
    update public.jobs set status = 'in_progress' where id = v_b.job_id and status in ('open', 'booked');
    perform public.notify(v_b.customer_id, 'Work started', 'Check-in confirmed with OTP', '/c/jobs/' || v_b.job_id);
  else
    if v_b.status <> 'in_progress' then
      return json_build_object('ok', false, 'error', 'bad_status');
    end if;
    insert into public.attendance_logs (booking_id, kind, lat, lng) values (p_booking, 'out', p_lat, p_lng);
    v_worked := ceil(extract(epoch from (now() - v_b.check_in_at)) / 60.0)::int;
    v_billed := greatest(v_job.duration_minutes,
                         least(v_worked, v_job.duration_minutes + v_b.extra_minutes_approved));
    v_amount := public.labour_amount(v_job.category_id,
                                     case when v_job.job_type = 'daily' then v_b.worker_id end, v_billed);
    update public.bookings set status = 'completed', check_out_at = now(), amount = v_amount,
      extra_minutes_requested = 0
    where id = p_booking;
    update public.worker_profiles set jobs_completed = jobs_completed + 1 where user_id = v_b.worker_id;
    perform public.notify(v_b.customer_id, 'Work completed', 'Please pay ₹' || (v_amount + v_b.platform_fee),
                          '/c/jobs/' || v_b.job_id);
  end if;
  delete from public.booking_otps where booking_id = p_booking;
  return json_build_object('ok', true, 'kind', v_otp.kind);
end $$;

create or replace function public.request_extra_time(p_booking uuid, p_minutes integer) returns void
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  if p_minutes not between 15 and 240 then raise exception 'invalid minutes'; end if;
  select * into v_b from public.bookings where id = p_booking and worker_id = auth.uid() for update;
  if not found then raise exception 'not your booking'; end if;
  if v_b.status <> 'in_progress' then raise exception 'work not in progress'; end if;
  update public.bookings set extra_minutes_requested = p_minutes where id = p_booking;
  perform public.notify(v_b.customer_id, 'Extra time requested', '+' || p_minutes || ' min',
                        '/c/jobs/' || v_b.job_id);
end $$;

-- ---------------------------------------------------------------------------
-- Admin functions
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_worker_status(p_worker uuid, p_status public.worker_status,
                                                          p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.worker_profiles set status = p_status,
    rejection_reason = case when p_status in ('rejected', 'suspended') then p_reason end,
    available = case when p_status = 'approved' then available else false end
  where user_id = p_worker;
  perform public.notify(p_worker,
    case p_status when 'approved' then 'Profile verified' when 'rejected' then 'Verification rejected'
                  when 'suspended' then 'Account suspended' else 'Profile under review' end,
    p_reason, '/w');
end $$;

create or replace function public.admin_refund_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_p public.payments;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v_p from public.payments where booking_id = p_booking and status = 'success'
    order by created_at desc limit 1 for update;
  if not found then raise exception 'no successful payment'; end if;
  update public.payments set status = 'refunded' where id = v_p.id;
  insert into public.wallet_ledger (user_id, amount, reason, booking_id)
  select worker_id, -amount, 'refund_reversal', id from public.bookings where id = p_booking;
  perform public.notify(v_p.customer_id, 'Refund issued', '₹' || v_p.amount, null);
end $$;

create or replace function public.admin_dashboard_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select json_build_object(
    'bookings_today', (select count(*) from public.bookings where created_at >= date_trunc('day', now())),
    'jobs_today', (select count(*) from public.jobs where created_at >= date_trunc('day', now())),
    'active_jobs', (select count(*) from public.bookings where status in ('accepted', 'on_the_way', 'in_progress')),
    'open_requests', (select count(*) from public.jobs where status = 'open'),
    'revenue_today', (select coalesce(sum(amount), 0) from public.payments
                      where status = 'success' and created_at >= date_trunc('day', now())),
    'revenue_total', (select coalesce(sum(amount), 0) from public.payments where status = 'success'),
    'platform_fees_total', (select coalesce(sum(b.platform_fee), 0) from public.bookings b where b.paid_at is not null),
    'new_workers', (select count(*) from public.worker_profiles where created_at >= now() - interval '7 days'),
    'pending_workers', (select count(*) from public.worker_profiles where status = 'pending'),
    'workers_online', (select count(*) from public.worker_profiles where available and verified),
    'customers', (select count(*) from public.profiles where role = 'customer'),
    'open_complaints', (select count(*) from public.complaints where status in ('open', 'in_review')),
    'completion_rate', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status = 'completed') / count(*)) end
                        from public.bookings where status not in ('requested', 'accepted', 'on_the_way', 'in_progress')),
    'daily', (select coalesce(json_agg(d order by d.day), '[]'::json) from (
                select to_char(g.day, 'YYYY-MM-DD') as day,
                  (select count(*) from public.jobs j where j.created_at >= g.day and j.created_at < g.day + interval '1 day') as jobs,
                  (select count(*) from public.bookings b where b.status = 'completed'
                     and b.check_out_at >= g.day and b.check_out_at < g.day + interval '1 day') as completed
                from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') g(day)
              ) d)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: functions are for signed-in users only; RLS guards every table.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant select on public.public_profiles to authenticated;
