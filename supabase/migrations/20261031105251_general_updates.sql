-- General Updates: public posts about an Incident, readable without logging in. Only a Coordinator posts one,
-- and posting is always their own insert: the AI draft function returns text and writes nothing.
create table public.general_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  posted_by uuid default auth.uid(),
  demo boolean not null default false, -- set from the Incident on insert
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

-- A General Update about a demo Incident is demo data, and it reaches, as a Notification, every Account with a
-- Case in the Incident and those travelers' Emergency Contacts. Same transaction and time as the post.
create function public.deliver_general_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select i.demo into strict new.demo from public.incidents i where i.id = new.incident_id;
  insert into public.notifications (account_id, kind, refers_to, demo, created_at)
    select distinct recipient, 'general_update'::public.notification_kind, new.id, new.demo, new.created_at from (
      select p.account_id as recipient from public.cases c join public.persons p on p.id = c.person_id where c.incident_id = new.incident_id
      union
      select ec.account_id from public.cases c join public.emergency_contacts ec on ec.person_id = c.person_id where c.incident_id = new.incident_id
    ) r where recipient is not null;
  return new;
end
$$;
revoke execute on function public.deliver_general_update from public, anon, authenticated;

create trigger deliver_general_update before insert on public.general_updates
  for each row execute function public.deliver_general_update();

create or replace function public.delete_demo_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.notifications where demo;
  delete from public.case_events where demo;
  delete from public.reports where demo;
  delete from public.cases where demo;
  delete from public.emergency_contacts where demo;
  delete from public.coordinators where demo;
  delete from public.persons where demo;
  delete from public.potential_incidents where demo;
  delete from public.general_updates where demo;
  delete from public.incidents where demo;
$$;
