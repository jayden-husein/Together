-- A Coordinator runs a Case: claim it, record Contact Attempts and notes, resolve it.
-- Each is a new Case event; update and delete stay revoked, so a correction is a new entry.

-- The name the queue and Case history show for a Coordinator. Coordinators now read this table
-- directly, superseding the first migration's "reachable only through the functions" for it.
alter table public.coordinators add column name text;

create policy "Coordinators read Coordinators" on public.coordinators
  for select to authenticated using ((select public.is_coordinator()));

-- The one way a Coordinator writes to a Case. It can't add a Person or a Report, and the
-- table's checks require a Reached answer on a Contact Attempt and an outcome on a resolution.
-- p_source_report_id: the Report the entry follows up, which must be one of this Case's.
create function public.record_case_event(
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
  if p_action not in ('claimed', 'contact_attempt', 'note', 'resolved') then
    raise exception 'A Coordinator can claim, record a Contact Attempt, add a note or resolve';
  end if;
  if p_action in ('note', 'contact_attempt') and coalesce(p_note, '') !~ '[^[:space:]]' then
    raise exception 'Write the note';
  end if;
  select * into strict target from public.cases where id = p_case_id;
  if p_source_report_id is not null and not exists (
    select 1 from public.reports where id = p_source_report_id and case_id = target.id
  ) then
    raise exception 'That Report is not part of this Case';
  end if;
  insert into public.case_events(case_id, action, actor, note, reached, outcome, source_report_id, demo)
    values (target.id, p_action, auth.uid(), nullif(trim(p_note), ''), p_reached, p_outcome, p_source_report_id, target.demo);
  -- The outcome reaches the Emergency Contacts through contact_case_updates(); the note never does.
  if p_action = 'resolved' then
    insert into public.notifications(account_id, kind, refers_to, demo)
      select account_id, 'individual_update', target.id, target.demo
      from public.emergency_contacts where person_id = target.person_id;
  end if;
end $$;
revoke all on function public.record_case_event(uuid, public.case_action, text, boolean, public.outcome, uuid) from public, anon;
grant execute on function public.record_case_event(uuid, public.case_action, text, boolean, public.outcome, uuid) to authenticated;
