-- A repeated resolution is a new decision if newer status evidence arrived meanwhile.
do $$ declare definition text; marker text := 'and created_at>now()-interval ''10 seconds''';begin
 select pg_get_functiondef(oid) into definition from pg_proc where pronamespace='public'::regnamespace and proname='record_case_event';
 if position(marker in definition)=0 then raise exception 'Expected idempotency guard not found';end if;
 definition:=replace(definition,marker,marker || $guard$
 and (p_action<>'resolved' or (
 not exists(select 1 from public.reports newer where newer.case_id=target.id and newer.kind in ('check_in','cant_reach') and newer.created_at>case_events.created_at)
 and not exists(select 1 from public.case_events newer where newer.case_id=target.id and newer.action='contact_attempt' and newer.reached and newer.created_at>case_events.created_at)))$guard$);
 execute definition;
end $$;
