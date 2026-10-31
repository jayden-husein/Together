-- Disambiguate generated sample travelers from the named demo accounts.
update public.persons p set name=p.name || ' Sample ' || substring(u.email from 'traveler-([0-9]+)')
from auth.users u where u.id=p.account_id and p.demo and u.email ~ '^traveler-[0-9]+@demo\.together\.example\.com$' and p.name not like '% Sample %';
-- Backfill missing requests for eligible cases without resetting anyone's answers.
insert into public.notifications(account_id,kind,refers_to,demo)
select p.account_id,'check_in_request',c.id,c.demo from public.cases c join public.persons p on p.id=c.person_id
where p.account_id is not null and not exists(select 1 from public.coordinators where account_id=p.account_id)
and not exists(select 1 from public.notifications where kind='check_in_request' and refers_to=c.id);
