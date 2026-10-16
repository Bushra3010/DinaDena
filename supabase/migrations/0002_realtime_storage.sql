-- Realtime: clients subscribe to these tables; RLS still decides which rows they receive.
alter publication supabase_realtime add table public.jobs, public.bookings, public.worker_locations,
  public.notifications;

-- Storage buckets. Paths are "<user id>/<file>" so folder ownership is the access rule.
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('job-photos', 'job-photos', true),
  ('worker-docs', 'worker-docs', false)
on conflict (id) do nothing;

create policy "own folder upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'job-photos', 'worker-docs')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder update" on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'job-photos', 'worker-docs')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "worker docs read" on storage.objects for select to authenticated
  using (bucket_id = 'worker-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
