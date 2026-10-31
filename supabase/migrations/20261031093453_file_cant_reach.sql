-- An Emergency Contact says they can't reach their traveler (ADR-0002: only on a traveler who named them).
-- One transaction appends the Report and delivers Individual Updates to the traveler's other Emergency Contacts.
create function public.file_cant_reach(p_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.cases;
begin
  select c.* into target from public.cases c
    join public.emergency_contacts ec on ec.person_id = c.person_id
    where c.id = p_case_id and ec.account_id = auth.uid();
  if not found then
    raise exception 'Only an Emergency Contact of this traveler can file a Can''t-reach report';
  end if;
  -- filed_by: so the Coordinator's Case history says which Emergency Contact filed it.
  insert into public.reports(kind, person_id, case_id, source, body, demo)
    values ('cant_reach', target.person_id, target.id, 'emergency_contact',
      jsonb_build_object('filed_by', (select email from auth.users where id = auth.uid())), target.demo);
  insert into public.notifications(account_id, kind, refers_to, demo)
    select account_id, 'individual_update', target.id, target.demo
    from public.emergency_contacts where person_id = target.person_id and account_id <> auth.uid();
end $$;
revoke all on function public.file_cant_reach(uuid) from public, anon;
grant execute on function public.file_cant_reach(uuid) to authenticated;
