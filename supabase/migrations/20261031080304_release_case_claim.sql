alter type public.case_action add value 'released';

-- Older demo accounts predate the coordinator name in the seed.
update public.coordinators c set name = 'Dana Ortiz'
from auth.users u where c.account_id = u.id and c.demo and c.name is null
  and u.email = 'coordinator@demo.together.example.com';

create or replace function public.record_case_event(
  p_case_id uuid, p_action public.case_action,
  p_note text default null, p_reached boolean default null, p_outcome public.outcome default null,
  p_source_report_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.cases;
begin
  if not public.is_coordinator() then
    raise exception 'A Coordinator account is required';
  end if;
  if p_action not in ('claimed', 'released', 'contact_attempt', 'note', 'resolved') then
    raise exception 'A Coordinator can claim or release a Case, record a Contact Attempt, add a note or resolve';
  end if;
  if p_action in ('note', 'contact_attempt') and coalesce(p_note, '') !~ '[^[:space:]]' then
    raise exception 'Write the note';
  end if;
  select * into strict target from public.cases where id = p_case_id for update;
  if p_action = 'released' and not exists (
    select 1 from (
      select actor, action from public.case_events where case_id = target.id and action in ('claimed', 'released')
      order by created_at desc, id desc limit 1
    ) latest where latest.action = 'claimed' and latest.actor = auth.uid()
  ) then
    raise exception 'Only the current owner can unclaim this case';
  end if;
  if p_source_report_id is not null and not exists (
    select 1 from public.reports where id = p_source_report_id and case_id = target.id
  ) then
    raise exception 'That Report is not part of this Case';
  end if;
  insert into public.case_events(case_id, action, actor, note, reached, outcome, source_report_id, demo, created_at)
    values (target.id, p_action, auth.uid(), nullif(trim(p_note), ''), p_reached, p_outcome, p_source_report_id, target.demo, clock_timestamp());
  -- The outcome reaches the Emergency Contacts through contact_case_updates(); the note never does.
  if p_action = 'resolved' then
    insert into public.notifications(account_id, kind, refers_to, demo)
      select account_id, 'individual_update', target.id, target.demo
      from public.emergency_contacts where person_id = target.person_id;
  end if;
end $$;
