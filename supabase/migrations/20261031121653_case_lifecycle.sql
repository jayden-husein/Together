-- Cancellation preserves the original report and its audit timestamp.
create table public.report_cancellations (
  report_id uuid primary key references public.reports,
  account_id uuid not null references auth.users,
  cancelled_at timestamptz not null default now()
);
alter table public.report_cancellations enable row level security;
grant select on public.report_cancellations to authenticated;
create policy "own or coordinator cancellations" on public.report_cancellations for select to authenticated
using (account_id=(select auth.uid()) or (select public.is_coordinator()));

create or replace function public.submit_check_in(p_case_id uuid, p_status text, p_description text default null)
returns void language plpgsql security definer set search_path='' as $$
declare owned public.cases;
begin
  if auth.uid() is null or public.is_coordinator() then raise exception 'Traveler access required' using errcode='42501'; end if;
  select c.* into owned from public.cases c join public.persons p on p.id=c.person_id where c.id=p_case_id and p.account_id=auth.uid() for update of c;
  if not found then raise exception 'Not your case' using errcode='42501'; end if;
  if p_status is null or p_status not in ('safe','needs_assistance') or (p_status='needs_assistance' and coalesce(trim(p_description),'')='') then raise exception 'Choose a status and describe any assistance needed' using errcode='22023'; end if;
  if length(coalesce(p_description,''))>2000 then raise exception 'Description too long' using errcode='22023'; end if;
  if exists(select 1 from public.reports where case_id=owned.id and kind='check_in' and body->>'status'=p_status and original_text is not distinct from case when p_status='needs_assistance' then trim(p_description) end and created_at>now()-interval '10 seconds') then return; end if;
  insert into public.reports(kind,person_id,case_id,source,original_text,body,demo)
    values('check_in',owned.person_id,owned.id,'traveler',case when p_status='needs_assistance' then trim(p_description) end,jsonb_build_object('status',p_status),owned.demo);
  insert into public.notifications(account_id,kind,refers_to,demo) select account_id,'individual_update',owned.id,owned.demo from public.emergency_contacts where person_id=owned.person_id;
end $$;

drop function public.file_cant_reach(uuid);
create function public.file_cant_reach(p_case_id uuid, p_confirmed boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.cases; report uuid;
begin
  if auth.uid() is null or public.is_coordinator() then raise exception 'Contact access required' using errcode='42501'; end if;
  select c.* into target from public.cases c join public.emergency_contacts ec on ec.person_id=c.person_id where c.id=p_case_id and ec.account_id=auth.uid() for update of c;
  if not found then raise exception 'Not your traveler' using errcode='42501'; end if;
  if not p_confirmed then raise exception 'Confirm before sending a report' using errcode='22023'; end if;
  -- One open report per contact and case. A later check-in or reached/resolved event closes it.
  select r.id into report from public.reports r where r.case_id=target.id and r.kind='cant_reach' and r.submitted_by=auth.uid()
    and not exists(select 1 from public.report_cancellations x where x.report_id=r.id)
    and not exists(select 1 from public.reports newer where newer.case_id=r.case_id and newer.kind='check_in' and newer.created_at>r.created_at)
    and not exists(select 1 from public.case_events e where e.case_id=r.case_id and (e.action='resolved' or e.action='contact_attempt' and e.reached) and e.created_at>r.created_at)
    order by r.created_at desc limit 1;
  if found then return report; end if;
  if (select count(*) from public.reports where submitted_by=auth.uid() and kind='cant_reach' and created_at>now()-interval '1 hour')>=20 then raise exception 'Report rate limit reached' using errcode='54000'; end if;
  insert into public.reports(kind,person_id,case_id,source,body,demo) values('cant_reach',target.person_id,target.id,'emergency_contact','{}',target.demo) returning id into report;
  insert into public.notifications(account_id,kind,refers_to,demo) select account_id,'individual_update',target.id,target.demo from public.emergency_contacts where person_id=target.person_id;
  return report;
end $$;
revoke all on function public.file_cant_reach(uuid,boolean) from public,anon;
grant execute on function public.file_cant_reach(uuid,boolean) to authenticated;

create function public.cancel_cant_reach(p_report_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.reports;
begin
  select * into r from public.reports where id=p_report_id and kind='cant_reach' and submitted_by=auth.uid();
  if not found or public.is_coordinator() then raise exception 'Not your report' using errcode='42501'; end if;
  if r.created_at<now()-interval '5 minutes' then raise exception 'Cancellation period ended' using errcode='22023'; end if;
  insert into public.report_cancellations(report_id,account_id) values(r.id,auth.uid()) on conflict do nothing;
  insert into public.notifications(account_id,kind,refers_to,demo) select account_id,'individual_update',r.case_id,r.demo from public.emergency_contacts where person_id=r.person_id;
end $$;
revoke all on function public.cancel_cant_reach(uuid) from public,anon;
grant execute on function public.cancel_cant_reach(uuid) to authenticated;

-- Safe projection: no note, description, contact identity, or traveler free text.
create or replace function public.contact_case_updates()
returns table(case_id uuid,incident_id uuid,person_name text,at timestamptz,entry_kind text,source text,status text,urgency public.urgency,outcome public.outcome)
language sql stable security definer set search_path='' as $$
with mine as (
 select c.id,c.incident_id,p.name from public.cases c join public.persons p on p.id=c.person_id join public.emergency_contacts ec on ec.person_id=p.id
 where ec.account_id=auth.uid() and not public.is_coordinator()
)
select m.id,m.incident_id,m.name,e.created_at,e.action::text,
 case when e.action='opened' then 'together' when e.action='urgency_proposed' then 'ai' when e.action='contact_attempt' and not e.reached then 'coordinator_not_reached' else 'coordinator' end,
 case when e.action='resolved' then 'resolved' when e.action='contact_attempt' and e.reached then 'safe' end,e.urgency,e.outcome
from mine m join public.case_events e on e.case_id=m.id where e.action in ('opened','urgency_proposed','urgency_changed','resolved','contact_attempt')
union all
select m.id,m.incident_id,m.name,r.created_at,r.kind::text,r.source::text,case when r.kind='check_in' then r.body->>'status' else 'cant_reach' end,null,null
from mine m join public.reports r on r.case_id=m.id where r.kind in ('check_in','cant_reach') and not exists(select 1 from public.report_cancellations x where x.report_id=r.id)
order by 4
$$;

create function public.send_check_in_request(p_case_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target public.cases; traveler uuid;
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501'; end if;
 select * into strict target from public.cases where id=p_case_id for update;
 select account_id into traveler from public.persons where id=target.person_id;
 if traveler is null or exists(select 1 from public.coordinators where account_id=traveler) then raise exception 'No eligible traveler account' using errcode='22023'; end if;
 if exists(select 1 from public.notifications where refers_to=target.id and kind='check_in_request' and created_at>now()-interval '10 seconds') then return; end if;
 insert into public.notifications(account_id,kind,refers_to,demo) values(traveler,'check_in_request',target.id,target.demo);
 insert into public.case_events(case_id,action,demo) values(target.id,'check_in_request_sent',target.demo);
end $$;
revoke all on function public.send_check_in_request(uuid) from public,anon;
grant execute on function public.send_check_in_request(uuid) to authenticated;

create function public.restore_potential_incident(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501'; end if;
 update public.potential_incidents set dismissed_at=null,dismissed_by=null,dismissal_reason=null where id=p_id and incident_id is null;
end $$;
revoke all on function public.restore_potential_incident(uuid) from public,anon;
grant execute on function public.restore_potential_incident(uuid) to authenticated;

-- Contact attempts deliver an Individual Update without exposing the note.
create function private.notify_contact_attempt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.action='contact_attempt' then
 insert into public.notifications(account_id,kind,refers_to,demo,created_at)
 select ec.account_id,'individual_update',new.case_id,new.demo,new.created_at from public.emergency_contacts ec join public.cases c on c.person_id=ec.person_id where c.id=new.case_id;
 end if;
 return new;
end $$;
create trigger contact_attempt_update after insert on public.case_events for each row execute function private.notify_contact_attempt();
