alter table public.incidents add column resolved_at timestamptz;
alter table public.incidents add column resolved_by uuid references auth.users on delete set null;

create function public.resolve_incident(p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_coordinator() then
    raise exception 'A Coordinator account is required';
  end if;
  perform pg_advisory_xact_lock(120012);
  update public.incidents set resolved_at = clock_timestamp(), resolved_by = auth.uid()
    where id = p_incident and resolved_at is null;
  if not found and not exists (select 1 from public.incidents where id = p_incident) then
    raise exception 'Incident not found';
  end if;
end $$;
revoke all on function public.resolve_incident from public, anon;
grant execute on function public.resolve_incident to authenticated;

-- Retire only the obsolete hand-made demo fixture when its verified replacement
-- exists. Keep its Cases and immutable Reports available as history.
update public.incidents legacy set resolved_at = clock_timestamp()
where legacy.demo and legacy.resolved_at is null
  and not exists (select 1 from public.potential_incidents p where p.incident_id = legacy.id)
  and exists (
    select 1 from public.incidents verified
    join public.potential_incidents p on p.incident_id = verified.id
    where verified.demo and verified.name = legacy.name and verified.area = legacy.area
  );

-- Replaying the same synthetic feed packet reuses its Potential incident.
alter table public.potential_incidents add column source_key text unique;
update public.potential_incidents set source_key = 'demo-flood-v1'
where id = (select id from public.potential_incidents where demo order by starts_at, id limit 1);

create or replace function public.open_matched_case(p_report uuid, p_person uuid, p_incident uuid, stop jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  opened uuid;
  case_demo boolean;
begin
  insert into public.cases (incident_id, person_id, demo)
    select i.id, p.id, i.demo or p.demo from public.incidents i, public.persons p
    where i.id = p_incident and i.resolved_at is null and p.id = p_person
    on conflict (incident_id, person_id) do nothing returning id, demo into opened, case_demo;
  if opened is not null then
    insert into public.case_events (case_id, action, source_report_id, note, demo)
      values (opened, 'opened', p_report, format('%s (%s to %s UTC)', stop->>'place',
        to_char((stop->>'start')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
        to_char((stop->>'end')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')), case_demo);
  end if;
end $$;
