-- Account sign-in history records no IP address, token, or user-entered text.
create table public.sign_in_history(id uuid primary key default gen_random_uuid(),account_id uuid not null references auth.users on delete cascade,at timestamptz not null default now());
alter table public.sign_in_history enable row level security;
grant select on public.sign_in_history to authenticated;
create policy "own sign-ins" on public.sign_in_history for select to authenticated using(account_id=(select auth.uid()));
create function public.record_sign_in() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if not exists(select 1 from public.sign_in_history where account_id=auth.uid() and at>now()-interval '10 seconds') then insert into public.sign_in_history(account_id) values(auth.uid());end if;
end $$;
create function public.my_sign_in_history() returns table(at timestamptz) language sql stable security invoker set search_path='' as $$ select at from public.sign_in_history where account_id=auth.uid() order by at desc limit 25 $$;
revoke all on function public.record_sign_in(),public.my_sign_in_history() from public,anon;
grant execute on function public.record_sign_in(),public.my_sign_in_history() to authenticated;

-- A point-in-polygon check, including interior holes, using the same fixed place coordinates as Match.
create function private.stop_matches(p_stop jsonb,p_incident public.incidents) returns boolean language plpgsql immutable set search_path='' as $$
declare point jsonb; ring jsonb; a jsonb; b jsonb; x double precision; y double precision; inside boolean; ring_number int:=0; i int;
begin
 if (p_stop->>'end')::timestamptz < p_incident.starts_at or (p_incident.ends_at is not null and (p_stop->>'start')::timestamptz > p_incident.ends_at) then return false; end if;
 point := '{"Grand Canyon Visitor Center":[-112.1094,36.0591],"Mather Point":[-112.1078,36.0617],"Bright Angel Trailhead":[-112.1436,36.0573],"Phantom Ranch":[-112.0947,36.1058],"Black Bridge":[-112.0894,36.0997],"Yavapai Point":[-112.1186,36.0657]}'::jsonb->(p_stop->>'place');
 if point is null then return false; end if;x:=(point->>0)::double precision;y:=(point->>1)::double precision;
 for ring in select value from jsonb_array_elements(p_incident.area->'coordinates') loop
  inside:=false;
  for i in 0..jsonb_array_length(ring)-2 loop
   a:=ring->i;b:=ring->(i+1);
   if ((a->>1)::double precision>y)<>((b->>1)::double precision>y) then
    if x<((b->>0)::double precision-(a->>0)::double precision)*(y-(a->>1)::double precision)/((b->>1)::double precision-(a->>1)::double precision)+(a->>0)::double precision then inside:=not inside;end if;
   end if;
  end loop;
  if ring_number=0 and not inside then return false;end if;
  if ring_number>0 and inside then return false;end if;
  ring_number:=ring_number+1;
 end loop;
 return ring_number>0;
end $$;
create function private.validate_matched_case() returns trigger language plpgsql security definer set search_path='' as $$
declare incident public.incidents;
begin
 select * into strict incident from public.incidents where id=new.incident_id;
 if incident.resolved_at is not null or not exists(
  select 1 from public.reports r cross join lateral jsonb_array_elements(r.body->'stops') s
  where r.person_id=new.person_id and r.kind='itinerary' and not exists(select 1 from public.reports newer where newer.supersedes=r.id)
  and private.stop_matches(s,incident)
 ) then raise exception 'A confirmed overlapping itinerary is required' using errcode='22023';end if;
 return new;
end $$;
create trigger validate_matched_case before insert on public.cases for each row execute function private.validate_matched_case();

-- Resolution closes outstanding cases with an explicit coordinator-selected outcome and reason.
drop function public.resolve_incident(uuid);
create function public.resolve_incident(p_incident uuid,p_reason text,p_outcome public.outcome) returns void language plpgsql security definer set search_path='' as $$
declare c record;
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501';end if;
 if coalesce(trim(p_reason),'')='' or p_outcome is null then raise exception 'Reason and outcome required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(120012);
 perform 1 from public.incidents where id=p_incident and resolved_at is null for update;
 if not found then raise exception 'Incident unavailable' using errcode='22023';end if;
 for c in select id from public.cases where incident_id=p_incident order by id loop
  -- Most recent status-bearing event determines whether this case remains unresolved.
  if coalesce((select status from (
   select created_at,'resolved'::text status from public.case_events where case_id=c.id and action='resolved'
   union all select created_at,'safe' from public.case_events where case_id=c.id and action='contact_attempt' and reached
   union all select r.created_at,r.body->>'status' from public.reports r where r.case_id=c.id and r.kind='check_in'
   union all select r.created_at,'cant_reach' from public.reports r where r.case_id=c.id and r.kind='cant_reach' and not exists(select 1 from public.report_cancellations x where x.report_id=r.id)
  ) h order by created_at desc limit 1),'unconfirmed')<>'resolved' then perform public.record_case_event(c.id,'resolved',p_reason,null,p_outcome);end if;
 end loop;
 update public.incidents set resolved_at=clock_timestamp(),resolved_by=auth.uid(),ends_at=coalesce(ends_at,greatest(starts_at+interval '1 second',clock_timestamp())) where id=p_incident;
 insert into public.activity(incident_id,action,details) values(p_incident,'resolution_reason',jsonb_build_object('reason',p_reason,'outcome',p_outcome));
end $$;
revoke all on function public.resolve_incident(uuid,text,public.outcome) from public,anon;
grant execute on function public.resolve_incident(uuid,text,public.outcome) to authenticated;

create function public.my_open_contact_reports() returns table(id uuid,case_id uuid,created_at timestamptz) language sql stable security definer set search_path='' as $$
select r.id,r.case_id,r.created_at from public.reports r join public.emergency_contacts ec on ec.person_id=r.person_id and ec.account_id=auth.uid()
where r.submitted_by=auth.uid() and r.kind='cant_reach' and not public.is_coordinator()
and not exists(select 1 from public.report_cancellations x where x.report_id=r.id)
and not exists(select 1 from public.reports newer where newer.case_id=r.case_id and newer.kind='check_in' and newer.created_at>r.created_at)
and not exists(select 1 from public.case_events e where e.case_id=r.case_id and (e.action='resolved' or e.action='contact_attempt' and e.reached) and e.created_at>r.created_at)
$$;
revoke all on function public.my_open_contact_reports() from public,anon;
grant execute on function public.my_open_contact_reports() to authenticated;

-- Public realtime data remains public; private change delivery is still filtered by RLS.
do $$ declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['incidents','general_updates','notifications','cases','reports','case_events','report_cancellations'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
  end loop;
 end if;
end $$;

-- Reject invalid geometry before it can reach Match or a map renderer.
create function private.validate_incident_geometry() returns trigger language plpgsql set search_path='' as $$
declare ring jsonb; point jsonb;
begin
 if new.area->>'type' is distinct from 'Polygon' or jsonb_typeof(new.area->'coordinates') is distinct from 'array' or jsonb_array_length(new.area->'coordinates')<1 then raise exception 'Polygon required' using errcode='22023';end if;
 for ring in select value from jsonb_array_elements(new.area->'coordinates') loop
  if jsonb_typeof(ring)<>'array' or jsonb_array_length(ring)<4 or ring->0<>ring->(jsonb_array_length(ring)-1) then raise exception 'Closed polygon ring required' using errcode='22023';end if;
  for point in select value from jsonb_array_elements(ring) loop
   if jsonb_typeof(point)<>'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number' or (point->>0)::numeric not between -180 and 180 or (point->>1)::numeric not between -90 and 90 then raise exception 'Valid longitude and latitude required' using errcode='22023';end if;
  end loop;
 end loop;return new;
end $$;
create trigger validate_incident_geometry before insert or update on public.incidents for each row execute function private.validate_incident_geometry();
