create table public.account_profiles (
 account_id uuid primary key references auth.users on delete cascade,
 display_name text check(length(display_name) between 1 and 100), phone text check(length(phone)<=40),
 time_zone text not null default 'America/Phoenix', preferences jsonb not null default '{}'
);
alter table public.account_profiles enable row level security;
grant select,insert,update on public.account_profiles to authenticated;
create policy "own profile" on public.account_profiles for all to authenticated using(account_id=(select auth.uid())) with check(account_id=(select auth.uid()));

-- Contact lookup is exact-email only. Never expose a searchable directory.
create function public.manage_emergency_contact(p_email text default null,p_person uuid default null,p_remove boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare contact uuid; person uuid;
begin
 if auth.uid() is null or public.is_coordinator() then raise exception 'Traveler or contact access required' using errcode='42501'; end if;
 if p_person is not null and p_remove then
   delete from public.emergency_contacts where person_id=p_person and account_id=auth.uid(); return;
 end if;
 select id into person from public.persons where account_id=auth.uid();
 if person is null then raise exception 'Create your traveler profile first' using errcode='22023'; end if;
 select id into contact from auth.users where lower(email)=lower(trim(p_email));
 if contact is null or exists(select 1 from public.coordinators where account_id=contact) then raise exception 'Choose a registered traveler or contact account' using errcode='22023'; end if;
 if contact=auth.uid() then raise exception 'Choose another account' using errcode='22023'; end if;
 if p_remove then delete from public.emergency_contacts where person_id=person and account_id=contact;
 else insert into public.emergency_contacts(person_id,account_id) values(person,contact) on conflict do nothing; end if;
end $$;
create function public.my_connections() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.is_coordinator() then raise exception 'Traveler or contact access required' using errcode='42501'; end if;
 return jsonb_build_object('contacts',coalesce((select jsonb_agg(jsonb_build_object('email',u.email,'name',coalesce(p.name,split_part(u.email,'@',1)))) from public.emergency_contacts ec join public.persons me on me.id=ec.person_id join auth.users u on u.id=ec.account_id left join public.persons p on p.account_id=u.id where me.account_id=auth.uid()),'[]'::jsonb),'travelers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) from public.emergency_contacts ec join public.persons p on p.id=ec.person_id where ec.account_id=auth.uid()),'[]'::jsonb));
end $$;
create function public.save_traveler_profile(p_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.is_coordinator() then raise exception 'Traveler access required' using errcode='42501'; end if;
 if length(trim(p_name)) not between 1 and 100 then raise exception 'Name must be 1 to 100 characters' using errcode='22023'; end if;
 insert into public.persons(account_id,name) values(auth.uid(),trim(p_name)) on conflict(account_id) do update set name=excluded.name;
end $$;
revoke all on function public.manage_emergency_contact(text,uuid,boolean),public.my_connections(),public.save_traveler_profile(text) from public,anon;
grant execute on function public.manage_emergency_contact(text,uuid,boolean),public.my_connections(),public.save_traveler_profile(text) to authenticated;

alter table public.case_events add column assigned_to uuid references public.coordinators;
create table public.case_presence (
 account_id uuid primary key references public.coordinators,
 case_id uuid not null references public.cases, seen_at timestamptz not null default now()
);
alter table public.case_presence enable row level security;
grant select,insert,update,delete on public.case_presence to authenticated;
create policy "coordinators view presence" on public.case_presence for select to authenticated using((select public.is_coordinator()));
create policy "own coordinator presence" on public.case_presence for all to authenticated using(account_id=(select auth.uid()) and (select public.is_coordinator())) with check(account_id=(select auth.uid()) and (select public.is_coordinator()));

-- One lock covers ownership check and event insertion; competing claims cannot both succeed.
drop function public.record_case_event(uuid,public.case_action,text,boolean,public.outcome,uuid,public.urgency);
create function public.record_case_event(p_case_id uuid,p_action public.case_action,p_note text default null,p_reached boolean default null,p_outcome public.outcome default null,p_source_report_id uuid default null,p_urgency public.urgency default null,p_assignee uuid default null,p_takeover_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare target public.cases; owner uuid; event_at timestamptz:=clock_timestamp();
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501'; end if;
 if p_action not in ('claimed','released','contact_attempt','note','resolved','urgency_changed') then raise exception 'Invalid action' using errcode='22023'; end if;
 if p_action in ('note','contact_attempt') and coalesce(trim(p_note),'')='' then raise exception 'Write a note' using errcode='22023'; end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Note too long' using errcode='22023'; end if;
 if (p_action='urgency_changed')<>(p_urgency is not null) then raise exception 'Choose an urgency' using errcode='22023'; end if;
 select * into strict target from public.cases where id=p_case_id for update;
 select case when action='claimed' then coalesce(assigned_to,actor) end into owner from public.case_events where case_id=target.id and action in ('claimed','released') order by created_at desc,id desc limit 1;
 if p_action='claimed' then
   if p_assignee is not null and not exists(select 1 from public.coordinators where account_id=p_assignee) then raise exception 'Choose a coordinator' using errcode='22023'; end if;
   if owner is not null and owner<>auth.uid() and coalesce(trim(p_takeover_reason),'')='' then raise exception 'Already claimed by another coordinator' using errcode='PT409'; end if;
   if owner=auth.uid() and coalesce(p_assignee,auth.uid())=auth.uid() then return; end if;
 end if;
 if p_action='released' and owner is distinct from auth.uid() then raise exception 'Only the owner may unclaim' using errcode='42501'; end if;
 if p_source_report_id is not null and not exists(select 1 from public.reports where id=p_source_report_id and case_id=target.id) then raise exception 'Invalid source report' using errcode='22023'; end if;
 insert into public.case_events(case_id,action,actor,assigned_to,note,reached,outcome,source_report_id,urgency,demo,created_at)
 values(target.id,p_action,auth.uid(),case when p_action='claimed' then coalesce(p_assignee,auth.uid()) end,coalesce(nullif(trim(p_takeover_reason),''),nullif(trim(p_note),'')),p_reached,p_outcome,p_source_report_id,p_urgency,target.demo,event_at);
 if p_action in ('resolved','urgency_changed') then insert into public.notifications(account_id,kind,refers_to,demo,created_at) select account_id,'individual_update',target.id,target.demo,event_at from public.emergency_contacts where person_id=target.person_id; end if;
end $$;
revoke all on function public.record_case_event(uuid,public.case_action,text,boolean,public.outcome,uuid,public.urgency,uuid,text) from public,anon;
grant execute on function public.record_case_event(uuid,public.case_action,text,boolean,public.outcome,uuid,public.urgency,uuid,text) to authenticated;

create function public.bulk_case_action(p_cases uuid[],p_action text,p_reached boolean default null,p_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501'; end if;
 if cardinality(p_cases) not between 1 and 50 or p_action not in ('claimed','contact_attempt') then raise exception 'Choose 1 to 50 cases and a valid action' using errcode='22023'; end if;
 -- Stable ordering avoids deadlocks across overlapping bulk selections.
 for c in select distinct x from unnest(p_cases) x order by x loop perform public.record_case_event(c,p_action::public.case_action,p_note,p_reached); end loop;
end $$;
revoke all on function public.bulk_case_action(uuid[],text,boolean,text) from public,anon;
grant execute on function public.bulk_case_action(uuid[],text,boolean,text) to authenticated;

create function private.audit_case_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.activity(incident_id,case_id,actor,action,details,created_at) select incident_id,new.case_id,new.actor,new.action::text,jsonb_build_object('event_id',new.id,'assigned_to',new.assigned_to),new.created_at from public.cases where id=new.case_id;
 return new;
end $$;
create trigger audit_case_event after insert on public.case_events for each row execute function private.audit_case_event();
create function private.audit_incident_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.activity(incident_id,action,details) values(new.id,case when tg_op='INSERT' then 'incident_created' when new.resolved_at is not null then 'incident_resolved' else 'incident_edited' end,jsonb_build_object('name',new.name,'starts_at',new.starts_at,'ends_at',new.ends_at));return new;
end $$;
create trigger audit_incident_change after insert or update on public.incidents for each row execute function private.audit_incident_change();
create function private.audit_potential_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.dismissed_at is distinct from new.dismissed_at then insert into public.activity(action,details) values(case when new.dismissed_at is null then 'potential_restored' else 'potential_dismissed' end,jsonb_build_object('potential_id',new.id,'reason',new.dismissal_reason)); end if;return new;
end $$;
create trigger audit_potential_change after update on public.potential_incidents for each row execute function private.audit_potential_change();

create function public.manage_incident(p_name text,p_area jsonb,p_start timestamptz,p_end timestamptz default null,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501'; end if;
 if length(trim(p_name)) not between 1 and 160 or p_area->>'type'<>'Polygon' or jsonb_typeof(p_area->'coordinates')<>'array' or p_start is null or p_end<=p_start then raise exception 'Provide a name, polygon, and valid time window' using errcode='22023'; end if;
 if p_id is null then insert into public.incidents(name,area,starts_at,ends_at) values(trim(p_name),p_area,p_start,p_end) returning incidents.id into id;
 else update public.incidents set name=trim(p_name),area=p_area,starts_at=p_start,ends_at=p_end where incidents.id=p_id and resolved_at is null returning incidents.id into id; end if;
 if id is null then raise exception 'Incident unavailable' using errcode='22023'; end if;
 return id;
end $$;
revoke all on function public.manage_incident(text,jsonb,timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.manage_incident(text,jsonb,timestamptz,timestamptz,uuid) to authenticated;

-- Health exposes no user data.
create function public.health() returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('status','ok','version','2.0.0') $$;
grant execute on function public.health() to anon,authenticated;
