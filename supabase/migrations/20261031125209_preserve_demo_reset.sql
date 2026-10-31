-- Keep the existing service-only demo reset compatible with new history references.
create or replace function public.delete_demo_data() returns void
language sql security definer set search_path='' as $$
 delete from public.activity where case_id in(select id from public.cases where demo) or incident_id in(select id from public.incidents where demo) or details->>'potential_id' in(select id::text from public.potential_incidents where demo);
 delete from public.report_cancellations where report_id in(select id from public.reports where demo);
 delete from public.case_presence where case_id in(select id from public.cases where demo) or account_id in(select account_id from public.coordinators where demo);
 delete from public.account_profiles where account_id in(select account_id from public.persons where demo union select account_id from public.coordinators where demo union select account_id from public.emergency_contacts where demo);
 delete from public.notifications where demo;
 delete from public.case_events where demo;
 delete from public.reports where demo;
 delete from public.cases where demo;
 delete from public.emergency_contacts where demo;
 delete from public.coordinators where demo;
 delete from public.persons where demo;
 delete from public.potential_incidents where demo;
 delete from public.general_updates where demo;
 delete from public.incidents where demo;
$$;
-- Keep contact identity private while identifying the signed-in contact's own report.
do $$ declare definition text;begin
 select pg_get_functiondef(oid) into definition from pg_proc where pronamespace='public'::regnamespace and proname='contact_case_updates';
 execute replace(definition,'r.source::text','case when r.kind=''cant_reach'' and r.submitted_by=auth.uid() then ''you'' else r.source::text end');
end $$;
