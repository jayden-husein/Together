create table public.potential_incidents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  summary text not null,
  area jsonb not null,
  sources jsonb not null,
  fallback boolean not null,
  starts_at timestamptz not null,
  incident_id uuid unique references public.incidents,
  demo boolean not null default false
);
alter table public.potential_incidents enable row level security;
revoke all on public.potential_incidents from anon, authenticated;
grant select on public.potential_incidents to authenticated;
grant select, insert, update, delete on public.potential_incidents to service_role;
create policy "Coordinators review Potential incidents" on public.potential_incidents
  for select to authenticated using ((select public.is_coordinator()));

create function public.notify_potential_incident() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.notifications(account_id, kind, refers_to, demo)
    select account_id, 'potential_incident', new.id, new.demo from public.coordinators;
  return new;
end $$;
create trigger potential_incident_notification after insert on public.potential_incidents
  for each row execute function public.notify_potential_incident();

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
  delete from public.incidents where demo;
$$;

-- Both directions of Match use the same Case, explanation and Check-in Request trigger.
create function public.open_matched_case(p_report uuid, p_person uuid, p_incident uuid, stop jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  opened uuid;
  case_demo boolean;
begin
  insert into public.cases (incident_id, person_id, demo)
    select i.id, p.id, i.demo or p.demo from public.incidents i, public.persons p
    where i.id = p_incident and p.id = p_person
    on conflict (incident_id, person_id) do nothing returning id, demo into opened, case_demo;
  if opened is not null then
    insert into public.case_events (case_id, action, source_report_id, note, demo)
      values (opened, 'opened', p_report, format('%s (%s to %s UTC)', stop->>'place',
        to_char((stop->>'start')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
        to_char((stop->>'end')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')), case_demo);
  end if;
end $$;
revoke all on function public.open_matched_case from public, anon, authenticated;
grant execute on function public.open_matched_case to service_role;

create or replace function public.confirm_itinerary(p_report uuid, p_account uuid, p_person uuid, p_stops jsonb, p_matches jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  traveler public.persons;
  decision jsonb;
begin
  select * into strict traveler from public.persons where id = p_person and account_id = p_account;
  insert into public.reports (id, kind, person_id, source, submitted_by, body, demo)
    values (p_report, 'itinerary', traveler.id, 'traveler', p_account, jsonb_build_object('stops', p_stops), traveler.demo)
    on conflict (id) do nothing;
  if not found then
    if exists (select 1 from public.reports where id = p_report and person_id = traveler.id
      and kind = 'itinerary' and body = jsonb_build_object('stops', p_stops)) then return; end if;
    raise exception 'Invalid confirmation id';
  end if;
  for decision in select value from jsonb_array_elements(p_matches) loop
    perform public.open_matched_case(p_report, traveler.id, (decision->>'incidentId')::uuid, decision->'stop');
  end loop;
end $$;

-- Serialize the commit phase of verification and confirmation. If a counterpart
-- arrived while the Edge Function was reading pages, retry Match on fresh data.
create function public.confirm_matched_itinerary(p_report uuid, p_account uuid, p_person uuid, p_stops jsonb,
  p_matches jsonb, p_incident_count bigint)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(120012);
  if p_incident_count <> (select count(*) from public.incidents) then
    raise exception 'Incidents changed during matching' using errcode = '40001';
  end if;
  perform public.confirm_itinerary(p_report, p_account, p_person, p_stops, p_matches);
end $$;

create function public.verify_potential_incident(p_id uuid, p_account uuid, p_start timestamptz, p_end timestamptz,
  p_matches jsonb, p_report_count bigint)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  draft public.potential_incidents;
  decision jsonb;
begin
  if not exists (select 1 from public.coordinators where account_id = p_account) then
    raise exception 'Coordinator required';
  end if;
  perform pg_advisory_xact_lock(120012);
  select * into strict draft from public.potential_incidents where id = p_id for update;
  if draft.incident_id is not null then return draft.incident_id; end if;
  if p_report_count <> (select count(*) from public.reports where kind = 'itinerary') then
    raise exception 'Itineraries changed during matching' using errcode = '40001';
  end if;
  insert into public.incidents(id, name, area, starts_at, ends_at, demo)
    values (draft.id, draft.name, draft.area, p_start, p_end, draft.demo);
  for decision in select value from jsonb_array_elements(p_matches) loop
    perform public.open_matched_case((decision->>'reportId')::uuid, (decision->>'personId')::uuid, draft.id, decision->'stop');
  end loop;
  update public.potential_incidents set incident_id = draft.id where id = draft.id;
  update public.notifications set read_at = coalesce(read_at, now()) where kind = 'potential_incident' and refers_to = draft.id;
  return draft.id;
end $$;
revoke all on function public.confirm_matched_itinerary, public.verify_potential_incident from public, anon, authenticated;
grant execute on function public.confirm_matched_itinerary, public.verify_potential_incident to service_role;
