-- A retry is a duplicate only while its answer is still the latest status-bearing event.
create or replace function public.submit_check_in(p_case_id uuid,p_status text,p_description text default null) returns void
language plpgsql security definer set search_path='' as $$
declare owned public.cases;
begin
 if auth.uid() is null or public.is_coordinator() then raise exception 'Traveler access required' using errcode='42501';end if;
 select c.* into owned from public.cases c join public.persons p on p.id=c.person_id where c.id=p_case_id and p.account_id=auth.uid() for update of c;
 if not found then raise exception 'Not your case' using errcode='42501';end if;
 if p_status is null or p_status not in ('safe','needs_assistance') or (p_status='needs_assistance' and coalesce(trim(p_description),'')='') then raise exception 'Choose a status and describe any assistance needed' using errcode='22023';end if;
 if length(coalesce(p_description,''))>2000 then raise exception 'Description too long' using errcode='22023';end if;
 if exists(select 1 from public.reports r where r.case_id=owned.id and r.kind='check_in' and r.body->>'status'=p_status
 and r.original_text is not distinct from case when p_status='needs_assistance' then trim(p_description) end and r.created_at>now()-interval '10 seconds'
 and not exists(select 1 from public.reports newer where newer.case_id=r.case_id and newer.kind in ('check_in','cant_reach') and newer.created_at>r.created_at and not exists(select 1 from public.report_cancellations x where x.report_id=newer.id))
 and not exists(select 1 from public.case_events e where e.case_id=r.case_id and (e.action='resolved' or e.action='contact_attempt' and e.reached) and e.created_at>r.created_at)) then return;end if;
 insert into public.reports(kind,person_id,case_id,source,original_text,body,demo) values('check_in',owned.person_id,owned.id,'traveler',case when p_status='needs_assistance' then trim(p_description) end,jsonb_build_object('status',p_status),owned.demo);
 insert into public.notifications(account_id,kind,refers_to,demo) select account_id,'individual_update',owned.id,owned.demo from public.emergency_contacts where person_id=owned.person_id;
end $$;
