-- Keep the traveler's pasted plans with the confirmed Itinerary (#11).
drop function public.confirm_itinerary(uuid, uuid, uuid, jsonb, jsonb);
create function public.confirm_itinerary(p_report uuid, p_account uuid, p_person uuid, p_stops jsonb, p_matches jsonb, p_original_text text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  traveler public.persons;
  decision jsonb;
  opened uuid;
  case_demo boolean;
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
    insert into public.cases (incident_id, person_id, demo)
      select i.id, traveler.id, traveler.demo or i.demo from public.incidents i
      where i.id = (decision->>'incidentId')::uuid
      on conflict (incident_id, person_id) do nothing returning id, demo into opened, case_demo;
    if opened is not null then
      insert into public.case_events (case_id, action, actor, source_report_id, note, demo)
        values (opened, 'opened', null, p_report,
          format('%s (%s to %s UTC)', decision#>>'{stop,place}',
            to_char((decision#>>'{stop,start}')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
            to_char((decision#>>'{stop,end}')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')), case_demo);
    end if;
  end loop;
end $$;
revoke all on function public.confirm_itinerary(uuid,uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.confirm_itinerary(uuid,uuid,uuid,jsonb,jsonb,text) to service_role;
