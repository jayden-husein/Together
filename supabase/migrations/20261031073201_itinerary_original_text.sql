-- Keep the traveler's pasted plans with the confirmed Itinerary (#11).
-- Same as 20261031072939's confirm_itinerary and confirm_matched_itinerary, plus p_original_text.
drop function public.confirm_matched_itinerary(uuid, uuid, uuid, jsonb, jsonb, bigint);
drop function public.confirm_itinerary(uuid, uuid, uuid, jsonb, jsonb);

create function public.confirm_itinerary(p_report uuid, p_account uuid, p_person uuid, p_stops jsonb, p_matches jsonb, p_original_text text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  traveler public.persons;
  decision jsonb;
begin
  select * into strict traveler from public.persons where id = p_person and account_id = p_account;
  insert into public.reports (id, kind, person_id, source, submitted_by, original_text, body, demo)
    values (p_report, 'itinerary', traveler.id, 'traveler', p_account, p_original_text, jsonb_build_object('stops', p_stops), traveler.demo)
    on conflict (id) do nothing;
  if not found then
    if exists (select 1 from public.reports where id = p_report and person_id = traveler.id and kind = 'itinerary'
      and body = jsonb_build_object('stops', p_stops) and original_text is not distinct from p_original_text) then return; end if;
    raise exception 'Invalid confirmation id';
  end if;
  for decision in select value from jsonb_array_elements(p_matches) loop
    perform public.open_matched_case(p_report, traveler.id, (decision->>'incidentId')::uuid, decision->'stop');
  end loop;
end $$;

create function public.confirm_matched_itinerary(p_report uuid, p_account uuid, p_person uuid, p_stops jsonb,
  p_matches jsonb, p_incident_count bigint, p_original_text text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(120012);
  if p_incident_count <> (select count(*) from public.incidents) then
    raise exception 'Incidents changed during matching' using errcode = '40001';
  end if;
  perform public.confirm_itinerary(p_report, p_account, p_person, p_stops, p_matches, p_original_text);
end $$;

revoke all on function public.confirm_itinerary, public.confirm_matched_itinerary from public, anon, authenticated;
grant execute on function public.confirm_itinerary, public.confirm_matched_itinerary to service_role;
