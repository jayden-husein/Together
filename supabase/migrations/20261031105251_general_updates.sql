-- General Updates: public posts about an Incident, readable without logging in. Only a Coordinator posts one,
-- and posting is always their own insert: the AI draft function returns text and writes nothing.
-- No demo flag: an update goes with its Incident, so delete_demo_data's Incident delete removes demo ones.
create table public.general_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  posted_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.general_updates enable row level security;

-- Who posted stays off the public page: readers get only the post itself. Append-only, like Reports.
revoke all on public.general_updates from anon, authenticated;
grant select (id, incident_id, body, created_at) on public.general_updates to anon, authenticated;
grant insert (incident_id, body) on public.general_updates to authenticated;

create policy "anyone reads General Updates" on public.general_updates for select to anon, authenticated using (true);
create policy "Coordinators post General Updates" on public.general_updates
  for insert to authenticated with check ((select public.is_coordinator()));
