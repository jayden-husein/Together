-- Urgency triage: the AI proposes an Urgency for each Needs assistance Check-in, and a Coordinator can change it.
-- Both are Case events; an Emergency Contact sees the Urgency through contact_case_updates(), never the quote in its note.

-- Called by the triage-check-in Edge Function with the server key. p_urgency null: the AI couldn't assess
-- the Check-in, so it stays Untriaged. p_quote: the traveler's words the AI output check found in the Report.
create function public.propose_urgency(p_report_id uuid, p_urgency public.urgency, p_quote text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  checked public.reports;
  target public.cases;
  event_at timestamptz := clock_timestamp();
begin
  select * into strict checked from public.reports
    where id = p_report_id and kind = 'check_in' and body ->> 'status' = 'needs_assistance';
  select * into strict target from public.cases where id = checked.case_id for update;
  -- One proposal per Check-in, however often the function is called.
  if exists (select 1 from public.case_events where source_report_id = checked.id and action = 'urgency_proposed') then
    return;
  end if;
  insert into public.case_events(case_id, action, actor, source_report_id, urgency, note, demo, created_at)
    values (target.id, 'urgency_proposed', null, checked.id, p_urgency, case when p_urgency is not null then p_quote end, target.demo, event_at);
  if p_urgency is not null then
    insert into public.notifications(account_id, kind, refers_to, demo, created_at)
      select account_id, 'individual_update', target.id, target.demo, event_at
      from public.emergency_contacts where person_id = target.person_id;
  end if;
end $$;
revoke all on function public.propose_urgency(uuid, public.urgency, text) from public, anon, authenticated;
grant execute on function public.propose_urgency(uuid, public.urgency, text) to service_role;

-- record_case_event gains p_urgency for an Urgency change, so it's dropped and recreated with its grants.
drop function public.record_case_event(uuid, public.case_action, text, boolean, public.outcome, uuid);

create function public.record_case_event(
  p_case_id uuid, p_action public.case_action,
  p_note text default null, p_reached boolean default null, p_outcome public.outcome default null,
  p_source_report_id uuid default null, p_urgency public.urgency default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.cases;
  -- The event and its Notifications share a time, so the Emergency Contact's update matches its Notification.
  event_at timestamptz := clock_timestamp();
begin
  if not public.is_coordinator() then
    raise exception 'A Coordinator account is required';
  end if;
  if p_action not in ('claimed', 'released', 'contact_attempt', 'note', 'resolved', 'urgency_changed') then
    raise exception 'A Coordinator can claim or release a Case, record a Contact Attempt, add a note, change the Urgency or resolve';
  end if;
  if p_action in ('note', 'contact_attempt') and coalesce(p_note, '') !~ '[^[:space:]]' then
    raise exception 'Write the note';
  end if;
  if (p_action = 'urgency_changed') <> (p_urgency is not null) then
    raise exception 'Choose an Urgency only when changing it';
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
  insert into public.case_events(case_id, action, actor, note, reached, outcome, source_report_id, urgency, demo, created_at)
    values (target.id, p_action, auth.uid(), nullif(trim(p_note), ''), p_reached, p_outcome, p_source_report_id, p_urgency, target.demo, event_at);
  -- The outcome and Urgency reach the Emergency Contacts through contact_case_updates(); the note never does.
  if p_action in ('resolved', 'urgency_changed') then
    insert into public.notifications(account_id, kind, refers_to, demo, created_at)
      select account_id, 'individual_update', target.id, target.demo, event_at
      from public.emergency_contacts where person_id = target.person_id;
  end if;
end $$;
revoke all on function public.record_case_event(uuid, public.case_action, text, boolean, public.outcome, uuid, public.urgency) from public, anon;
grant execute on function public.record_case_event(uuid, public.case_action, text, boolean, public.outcome, uuid, public.urgency) to authenticated;
