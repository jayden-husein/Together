create or replace function private.enforce_account_separation() returns trigger
language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
  if tg_table_name='coordinators' then
    if exists(select 1 from public.persons where account_id=new.account_id)
       or exists(select 1 from public.emergency_contacts where account_id=new.account_id) then
      raise exception 'Coordinator accounts cannot be travelers or emergency contacts' using errcode='42501';
    end if;
    return new;
  end if;
  if tg_table_name in ('persons','emergency_contacts','notifications') then account := new.account_id;
  else select account_id into account from public.persons where id=new.person_id;
  end if;
  if tg_table_name='notifications' then
    if new.kind<>'check_in_request' then return new; end if;
  end if;
  if exists(select 1 from public.coordinators where account_id=account) then
    raise exception 'Coordinator accounts cannot be travelers or emergency contacts' using errcode='42501';
  end if;
  if tg_table_name='reports' then
  if new.kind='cant_reach' and exists(select 1 from public.coordinators where account_id=new.submitted_by) then
    raise exception 'Coordinator accounts cannot file reports' using errcode='42501';
  end if;
  end if;
  return new;
end $$;

-- Disambiguate generated sample travelers from the named demo accounts.
update public.persons p set name=p.name || ' Sample ' || substring(u.email from 'traveler-([0-9]+)')
from auth.users u where u.id=p.account_id and p.demo and u.email ~ '^traveler-[0-9]+@demo\.together\.example\.com$' and p.name not like '% Sample %';
-- Backfill missing requests for eligible cases without resetting anyone's answers.
insert into public.notifications(account_id,kind,refers_to,demo)
select p.account_id,'check_in_request',c.id,c.demo from public.cases c join public.persons p on p.id=c.person_id
where p.account_id is not null and not exists(select 1 from public.coordinators where account_id=p.account_id)
and not exists(select 1 from public.notifications where kind='check_in_request' and refers_to=c.id);
