-- The "Work completed" notification named one worker's share as if it were the bill.
-- It now says who finished, and asks for the job's unpaid total once the last worker is done.

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
    -- Ask for payment once, with the job total, when the last worker checks out.
    if exists (select 1 from public.bookings where job_id = v_b.job_id
               and status in ('accepted', 'on_the_way', 'in_progress')) then
      perform public.notify(v_b.customer_id, 'Work completed',
        coalesce((select full_name from public.profiles where id = v_b.worker_id), 'Worker')
          || ' finished · ₹' || (v_amount + v_b.platform_fee),
        '/c/jobs/' || v_b.job_id);
    else
      perform public.notify(v_b.customer_id, 'Work completed',
        'Please pay ₹' || (select sum(amount + platform_fee) from public.bookings
                           where job_id = v_b.job_id and status = 'completed' and paid_at is null),
        '/c/jobs/' || v_b.job_id);
    end if;
  end if;
  delete from public.booking_otps where booking_id = p_booking;
  return json_build_object('ok', true, 'kind', v_otp.kind);
end $$;
