-- Deliver requests when a Case opens, including Cases opened before this migration.
create function public.notify_check_in_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(account_id, kind, refers_to, demo)
    select account_id, 'check_in_request', new.id, new.demo
    from public.persons where id = new.person_id and account_id is not null;
  return new;
end $$;
revoke all on function public.notify_check_in_request() from public, anon, authenticated;
create trigger case_check_in_request after insert on public.cases
for each row execute function public.notify_check_in_request();

insert into public.notifications(account_id, kind, refers_to, demo)
select p.account_id, 'check_in_request', c.id, c.demo
from public.cases c join public.persons p on p.id = c.person_id
where p.account_id is not null and not exists (
  select 1 from public.notifications n where n.kind = 'check_in_request'
    and n.refers_to = c.id and n.account_id = p.account_id
);

-- A single transaction appends the traveler's Report and delivers the contact Notifications.
create function public.submit_check_in(p_case_id uuid, p_status text, p_description text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owned public.cases;
begin
  select c.* into strict owned from public.cases c join public.persons p on p.id = c.person_id
    where c.id = p_case_id and p.account_id = auth.uid();
  if p_status is null or p_status not in ('safe', 'needs_assistance')
     or (p_status = 'needs_assistance' and coalesce(p_description, '') !~ '[^[:space:]]') then
    raise exception 'Choose a status and describe any assistance needed';
  end if;
  insert into public.reports(kind, person_id, case_id, source, original_text, body, demo)
    values ('check_in', owned.person_id, owned.id, 'traveler',
      case when p_status = 'needs_assistance' then trim(p_description) end,
      jsonb_build_object('status', p_status), owned.demo);
  insert into public.notifications(account_id, kind, refers_to, demo)
    select account_id, 'individual_update', owned.id, owned.demo
    from public.emergency_contacts where person_id = owned.person_id;
end $$;
revoke all on function public.submit_check_in(uuid,text,text) from public, anon;
grant execute on function public.submit_check_in(uuid,text,text) to authenticated;
