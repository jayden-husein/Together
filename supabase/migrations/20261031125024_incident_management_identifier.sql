-- Creating or expanding an Incident matches existing confirmed itineraries atomically.
create or replace function public.manage_incident(p_name text,p_area jsonb,p_start timestamptz,p_end timestamptz default null,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid; incident public.incidents; r record;
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501';end if;
 if length(trim(p_name)) not between 1 and 160 or p_area->>'type'<>'Polygon' or jsonb_typeof(p_area->'coordinates')<>'array' or p_start is null or p_end<=p_start then raise exception 'Provide a name, polygon, and valid time window' using errcode='22023';end if;
 perform pg_advisory_xact_lock(120012);
 if p_id is null then insert into public.incidents(name,area,starts_at,ends_at) values(trim(p_name),p_area,p_start,p_end) returning incidents.id into saved_id;
 else update public.incidents set name=trim(p_name),area=p_area,starts_at=p_start,ends_at=p_end where incidents.id=p_id and resolved_at is null returning incidents.id into saved_id;end if;
 if saved_id is null then raise exception 'Incident unavailable' using errcode='22023';end if;
 select * into strict incident from public.incidents where incidents.id=saved_id;
 for r in select distinct on (p.id) p.id person_id,report.id report_id,s.value stop from public.persons p join public.reports report on report.person_id=p.id cross join lateral jsonb_array_elements(report.body->'stops') s
 where report.kind='itinerary' and not exists(select 1 from public.reports newer where newer.supersedes=report.id)
 and p.account_id is not null and not exists(select 1 from public.coordinators where account_id=p.account_id)
 and private.stop_matches(s.value,incident) order by p.id,report.created_at desc loop
  perform public.open_matched_case(r.report_id,r.person_id,saved_id,r.stop);
 end loop;
 return saved_id;
end $$;
