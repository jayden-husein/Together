-- An Individual Update says what happened (entry_kind) and who it came from (source) separately.

create type public.report_source as enum ('traveler', 'emergency_contact', 'venue', 'device');
alter table public.reports alter column source type public.report_source using source::public.report_source;

-- The return columns change, so the function is dropped and recreated with its grants.
drop function public.contact_case_updates();

create function public.contact_case_updates()
returns table (
  case_id uuid, incident_id uuid, person_name text, at timestamptz,
  entry_kind text, source text, status text, urgency public.urgency, outcome public.outcome
)
language sql stable security definer set search_path = '' as $$
  with my_cases as (
    select c.id, c.incident_id, p.name
    from public.cases c
    join public.persons p on p.id = c.person_id
    join public.emergency_contacts ec on ec.person_id = c.person_id
    where ec.account_id = auth.uid()
  )
  select m.id, m.incident_id, m.name, e.created_at, e.action::text,
         case e.action when 'opened' then 'together' when 'urgency_proposed' then 'ai' else 'coordinator' end,
         case when e.action = 'resolved' then 'resolved' end, e.urgency, e.outcome
  from my_cases m join public.case_events e on e.case_id = m.id
  where e.action in ('opened', 'urgency_proposed', 'urgency_changed', 'resolved')
  union all
  select m.id, m.incident_id, m.name, r.created_at, r.kind::text, r.source::text,
         case when r.kind = 'check_in' then r.body ->> 'status' else 'cant_reach' end, null, null
  from my_cases m join public.reports r on r.case_id = m.id
  where r.kind in ('check_in', 'cant_reach')
  order by 4
$$;

revoke execute on function public.contact_case_updates from public, anon;
grant execute on function public.contact_case_updates to authenticated;
