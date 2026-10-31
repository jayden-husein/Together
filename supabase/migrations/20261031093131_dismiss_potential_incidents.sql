alter table public.potential_incidents
  add column corroborated boolean not null default false,
  add column dismissed_at timestamptz,
  add column dismissed_by uuid references public.coordinators on delete set null,
  add column dismissal_reason text,
  add column earlier_dismissal_id uuid references public.potential_incidents on delete set null,
  add constraint dismissal_has_reason check ((dismissed_at is null) = (dismissal_reason is null)),
  add constraint verified_or_dismissed check (incident_id is null or dismissed_at is null);

-- A dismissal is a judgment about these readings only; a new reading raises a new Potential incident.
create function public.dismiss_potential_incident(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_coordinator() then
    raise exception 'A Coordinator account is required';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Write the reason';
  end if;
  update public.potential_incidents set dismissed_at = now(), dismissed_by = auth.uid(), dismissal_reason = trim(p_reason)
    where id = p_id and incident_id is null and dismissed_at is null;
  if not found then
    raise exception 'This Potential incident was already verified or dismissed';
  end if;
  update public.notifications set read_at = coalesce(read_at, now()) where kind = 'potential_incident' and refers_to = p_id;
end $$;
revoke all on function public.dismiss_potential_incident from public, anon;
grant execute on function public.dismiss_potential_incident to authenticated;

-- Same as before, but a dismissed Potential incident can't be verified.
create or replace function public.verify_potential_incident(p_id uuid, p_account uuid, p_start timestamptz, p_end timestamptz,
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
  if draft.dismissed_at is not null then
    raise exception 'This Potential incident was dismissed' using errcode = 'P0409';
  end if;
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
