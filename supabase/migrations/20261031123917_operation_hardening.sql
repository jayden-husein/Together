-- Identical repeated coordinator submissions within ten seconds are idempotent.
do $$ declare definition text;begin
 select pg_get_functiondef(oid) into definition from pg_proc where pronamespace='public'::regnamespace and proname='record_case_event';
 definition:=replace(definition,' insert into public.case_events(case_id,action,actor,assigned_to,note,reached,outcome,source_report_id,urgency,demo,created_at)',
 $check$
 if exists(select 1 from public.case_events where case_id=target.id and actor=auth.uid() and action=p_action and created_at>now()-interval '10 seconds'
 and note is not distinct from coalesce(nullif(trim(p_takeover_reason),''),nullif(trim(p_note),'')) and reached is not distinct from p_reached and outcome is not distinct from p_outcome and urgency is not distinct from p_urgency and source_report_id is not distinct from p_source_report_id
 and assigned_to is not distinct from case when p_action='claimed' then coalesce(p_assignee,auth.uid()) end) then return;end if;
 insert into public.case_events(case_id,action,actor,assigned_to,note,reached,outcome,source_report_id,urgency,demo,created_at)$check$);
 execute definition;
end $$;

alter type public.notification_kind add value if not exists 'case_update';
create or replace function private.audit_case_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.activity(incident_id,case_id,actor,action,details,created_at) select incident_id,new.case_id,new.actor,new.action::text,jsonb_build_object('event_id',new.id,'assigned_to',new.assigned_to),new.created_at from public.cases where id=new.case_id;
 if new.action in ('claimed','released','resolved') then insert into public.notifications(account_id,kind,refers_to,demo,created_at) select account_id,'case_update',new.case_id,new.demo,new.created_at from public.coordinators;end if;
 return new;
end $$;
-- Foreign-key and queue access paths used by the UI and RLS projections.
create index if not exists reports_person_kind_at on public.reports(person_id,kind,created_at desc);
create index if not exists reports_case_kind_at on public.reports(case_id,kind,created_at desc);
create index if not exists case_events_case_at on public.case_events(case_id,created_at desc,id desc);
create index if not exists notifications_account_at on public.notifications(account_id,created_at desc);
create index if not exists emergency_contacts_account on public.emergency_contacts(account_id);
create index if not exists activity_incident_at on public.activity(incident_id,created_at desc);
create index if not exists general_updates_incident_at on public.general_updates(incident_id,created_at desc);
create index if not exists case_presence_case on public.case_presence(case_id,seen_at desc);
