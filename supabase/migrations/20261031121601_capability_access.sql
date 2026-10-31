-- Membership is authoritative; traveler/contact capabilities are additive and derived.
create function public.account_capabilities() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare coord boolean; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  coord := public.is_coordinator();
  select jsonb_build_object(
    'isCoordinator', coord,
    'isTraveler', not coord and exists(select 1 from public.reports r join public.persons p on p.id=r.person_id where p.account_id=auth.uid() and r.kind='itinerary') or not coord and exists(select 1 from public.notifications where account_id=auth.uid() and kind='check_in_request'),
    'isEmergencyContact', not coord and exists(select 1 from public.emergency_contacts where account_id=auth.uid()),
    'name', coalesce((select name from public.coordinators where account_id=auth.uid()), (select name from public.persons where account_id=auth.uid()), split_part((select email from auth.users where id=auth.uid()),'@',1))
  ) into result;
  return result;
end $$;
revoke all on function public.account_capabilities() from public, anon;
grant execute on function public.account_capabilities() to authenticated;

create schema if not exists private;
revoke all on schema private from public;
-- Triggers also guard service-role writes from Edge Functions and future seed scripts.
create function private.enforce_account_separation() returns trigger
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
  if tg_table_name='notifications' and new.kind<>'check_in_request' then return new; end if;
  if exists(select 1 from public.coordinators where account_id=account) then
    raise exception 'Coordinator accounts cannot be travelers or emergency contacts' using errcode='42501';
  end if;
  if tg_table_name='reports' and new.kind='cant_reach' and exists(select 1 from public.coordinators where account_id=new.submitted_by) then
    raise exception 'Coordinator accounts cannot file reports' using errcode='42501';
  end if;
  return new;
end $$;
create trigger account_separation before insert or update on public.persons for each row execute function private.enforce_account_separation();
create trigger account_separation before insert or update on public.emergency_contacts for each row execute function private.enforce_account_separation();
create trigger account_separation before insert on public.cases for each row execute function private.enforce_account_separation();
create trigger account_separation before insert on public.reports for each row execute function private.enforce_account_separation();
create trigger account_separation before insert on public.notifications for each row execute function private.enforce_account_separation();
create trigger account_separation before insert or update on public.coordinators for each row execute function private.enforce_account_separation();

-- Existing RPCs keep their signatures, but authorization failures now map to HTTP 403.
do $$ declare f record; definition text;
begin
  for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('record_case_event','resolve_incident','dismiss_potential_incident') loop
    definition := pg_get_functiondef(f.oid);
    definition := replace(definition, 'raise exception ''A Coordinator account is required'';', 'raise exception ''A Coordinator account is required'' using errcode=''42501'';');
    execute definition;
  end loop;
end $$;
