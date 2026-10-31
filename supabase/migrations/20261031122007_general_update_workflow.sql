alter table public.general_updates add column edited_at timestamptz;
alter table public.general_updates add column retracted_at timestamptz;
alter table public.general_updates add column request_id uuid unique;
grant select(edited_at,retracted_at) on public.general_updates to anon,authenticated;
grant insert(request_id) on public.general_updates to authenticated;
alter table public.general_updates add constraint general_updates_500 check(length(trim(body)) between 1 and 500) not valid;

create table public.activity (
 id uuid primary key default gen_random_uuid(), incident_id uuid references public.incidents,
 case_id uuid references public.cases, actor uuid default auth.uid(), action text not null,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.activity enable row level security;
revoke all on public.activity from anon,authenticated;
grant select on public.activity to authenticated;
create policy "coordinator activity only" on public.activity for select to authenticated using ((select public.is_coordinator()));
create function private.audit_update() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if tg_op='INSERT' then
   if exists(select 1 from public.incidents where id=new.incident_id and resolved_at is not null) then raise exception 'Incident resolved' using errcode='22023'; end if;
   if (select count(*) from public.general_updates where posted_by=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise exception 'Please wait before posting again' using errcode='54000'; end if;
 end if;
 insert into public.activity(incident_id,action,details) values(new.incident_id,case when tg_op='INSERT' then 'update_posted' when new.retracted_at is not null and old.retracted_at is null then 'update_retracted' else 'update_edited' end,jsonb_build_object('update_id',new.id,'body',new.body));
 return new;
end $$;
create trigger audit_update after insert or update on public.general_updates for each row execute function private.audit_update();
create function public.edit_general_update(p_id uuid,p_body text default null,p_retract boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare target public.general_updates;
begin
 if not public.is_coordinator() then raise exception 'Coordinator access required' using errcode='42501'; end if;
 select * into strict target from public.general_updates where id=p_id for update;
 if p_retract then update public.general_updates set retracted_at=coalesce(retracted_at,now()),body='Retracted by a Coordinator' where id=target.id; return; end if;
 if target.retracted_at is not null or target.created_at<now()-interval '10 minutes' then raise exception 'Edit window ended' using errcode='22023'; end if;
 if length(trim(coalesce(p_body,''))) not between 1 and 500 then raise exception 'Write 1 to 500 characters' using errcode='22023'; end if;
 update public.general_updates set body=trim(p_body),edited_at=now() where id=target.id;
end $$;
revoke all on function public.edit_general_update(uuid,text,boolean) from public,anon;
grant execute on function public.edit_general_update(uuid,text,boolean) to authenticated;
