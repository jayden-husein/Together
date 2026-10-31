-- A Correction is a new Itinerary Report that supersedes an old one (#39). An Itinerary is in force
-- while nothing supersedes it; the unique constraint lets each be superseded at most once.
alter table public.reports add column supersedes uuid unique references public.reports;

-- Same as 20261031073201's functions, plus p_supersedes. The Edge Function checks the started stops.
drop function public.confirm_matched_itinerary(uuid, uuid, uuid, jsonb, jsonb, bigint, text);
drop function public.confirm_itinerary(uuid, uuid, uuid, jsonb, jsonb, text);

create function public.confirm_itinerary(p_report uuid, p_account uuid, p_person uuid, p_stops jsonb, p_matches jsonb,
  p_original_text text default null, p_supersedes uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  traveler public.persons;
  decision jsonb;
begin
  select * into strict traveler from public.persons where id = p_person and account_id = p_account;
  if p_supersedes is not null and not exists (select 1 from public.reports
    where id = p_supersedes and person_id = traveler.id and kind = 'itinerary') then
    raise exception 'Invalid Itinerary to correct';
  end if;
  begin
    insert into public.reports (id, kind, person_id, source, submitted_by, original_text, body, demo, supersedes)
      values (p_report, 'itinerary', traveler.id, 'traveler', p_account, p_original_text, jsonb_build_object('stops', p_stops), traveler.demo, p_supersedes)
      on conflict (id) do nothing;
  exception when unique_violation then
    -- Only supersedes can clash here: an id clash does nothing.
    raise exception 'This Itinerary was already corrected' using errcode = 'TG409';
  end;
  if not found then
    if exists (select 1 from public.reports where id = p_report and person_id = traveler.id and kind = 'itinerary'
      and body = jsonb_build_object('stops', p_stops) and original_text is not distinct from p_original_text
      and supersedes is not distinct from p_supersedes) then return; end if;
    raise exception 'Invalid confirmation id';
  end if;
  for decision in select value from jsonb_array_elements(p_matches) loop
    perform public.open_matched_case(p_report, traveler.id, (decision->>'incidentId')::uuid, decision->'stop');
  end loop;
end $$;

create function public.confirm_matched_itinerary(p_report uuid, p_account uuid, p_person uuid, p_stops jsonb,
  p_matches jsonb, p_incident_count bigint, p_original_text text default null, p_supersedes uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(120012);
  if p_incident_count <> (select count(*) from public.incidents) then
    raise exception 'Incidents changed during matching' using errcode = '40001';
  end if;
  perform public.confirm_itinerary(p_report, p_account, p_person, p_stops, p_matches, p_original_text, p_supersedes);
end $$;

revoke all on function public.confirm_itinerary, public.confirm_matched_itinerary from public, anon, authenticated;
grant execute on function public.confirm_itinerary, public.confirm_matched_itinerary to service_role;
