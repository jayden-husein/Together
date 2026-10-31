-- Together's shared records. Row-level security is the authorization (ADR-0001).
-- Every table has a `demo` flag: scripts/reset-demo.ts deletes and reloads only flagged rows.

create type public.report_kind as enum ('itinerary', 'check_in', 'cant_reach', 'venue_record', 'location_ping');
create type public.case_action as enum (
  'opened', 'check_in_request_sent', 'urgency_proposed', 'urgency_changed',
  'claimed', 'contact_attempt', 'note', 'resolved'
);
create type public.urgency as enum ('immediate', 'urgent', 'can_wait');
create type public.outcome as enum ('reached', 'assistance_provided', 'not_in_area');
create type public.notification_kind as enum ('general_update', 'individual_update', 'check_in_request', 'potential_incident');

-- A Person exists only by their own consent (ADR-0002): there is no insert policy, so only
-- the server key (sign-up flow, demo seed) can add one.
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references auth.users on delete set null,
  name text not null,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.emergency_contacts (
  person_id uuid not null references public.persons on delete cascade,
  account_id uuid not null references auth.users on delete cascade,
  demo boolean not null default false,
  primary key (person_id, account_id)
);

-- Coordinator membership is a marker on an Account; a Coordinator works every Incident.
create table public.coordinators (
  account_id uuid primary key references auth.users on delete cascade,
  demo boolean not null default false
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area jsonb not null, -- GeoJSON Polygon, copied from source geometry
  starts_at timestamptz not null,
  ends_at timestamptz, -- null: still ongoing
  simulation boolean not null default true,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents,
  person_id uuid not null references public.persons,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (incident_id, person_id),
  unique (id, person_id) -- lets a Report's case belong to the Report's own Person
);

-- Reports and Case events are append-only: a correction is a new row.
-- Actors are plain ids, not foreign keys, so deleting an Account never rewrites history.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  kind public.report_kind not null,
  person_id uuid not null references public.persons,
  case_id uuid, -- the Case a Check-in or Can't-reach report is about
  source text not null, -- who it came from, e.g. traveler, emergency_contact, venue, device
  submitted_by uuid default auth.uid(),
  original_text text,
  body jsonb not null default '{}',
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (case_id, person_id) references public.cases (id, person_id),
  check (kind <> 'check_in' or body ->> 'status' in ('safe', 'needs_assistance'))
);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases,
  action public.case_action not null,
  actor uuid default auth.uid(),
  source_report_id uuid references public.reports,
  urgency public.urgency,
  outcome public.outcome,
  reached boolean,
  note text,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  check ((action = 'resolved') = (outcome is not null)),
  check (action = 'urgency_changed' or action = 'urgency_proposed' or urgency is null),
  check (action <> 'urgency_changed' or urgency is not null),
  check ((action = 'contact_attempt') = (reached is not null))
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users on delete cascade,
  kind public.notification_kind not null,
  refers_to uuid, -- the Case, Incident, General Update or Potential incident
  read_at timestamptz,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

revoke update, delete, truncate on public.reports, public.case_events from anon, authenticated, service_role;

-- Helpers for policies. Security definer so policies on persons and cases don't recurse.
create function public.my_person_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.persons where account_id = auth.uid()
$$;

create function public.is_coordinator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coordinators where account_id = auth.uid())
$$;

alter table public.persons enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.coordinators enable row level security;
alter table public.incidents enable row level security;
alter table public.cases enable row level security;
alter table public.reports enable row level security;
alter table public.case_events enable row level security;
alter table public.notifications enable row level security;

create policy "anyone reads Incidents" on public.incidents for select to anon, authenticated using (true);

create policy "travelers read their own Person; Coordinators read people in Cases" on public.persons
  for select to authenticated using (
    account_id = (select auth.uid())
    or ((select public.is_coordinator()) and exists (select 1 from public.cases c where c.person_id = persons.id))
  );

create policy "travelers read their own Cases; Coordinators read all" on public.cases
  for select to authenticated using (
    person_id in (select public.my_person_ids()) or (select public.is_coordinator())
  );

create policy "travelers read their own Reports; Coordinators read those of people in Cases" on public.reports
  for select to authenticated using (
    person_id in (select public.my_person_ids())
    or ((select public.is_coordinator()) and exists (select 1 from public.cases c where c.person_id = reports.person_id))
  );

create policy "Coordinators read Case events" on public.case_events
  for select to authenticated using ((select public.is_coordinator()));

create policy "Accounts read their own Notifications" on public.notifications
  for select to authenticated using (account_id = (select auth.uid()));

-- emergency_contacts and coordinators have no policies: reachable only through the functions here.

-- The Individual Update view: what an Emergency Contact may see of their travelers' Cases.
-- One row per history entry that sets a status, Urgency or outcome. Never free text or notes.
create function public.contact_case_updates()
returns table (
  case_id uuid, incident_id uuid, person_name text, at timestamptz,
  source_kind text, status text, urgency public.urgency, outcome public.outcome
)
language sql stable security definer set search_path = '' as $$
  with my_cases as (
    select c.id, c.incident_id, p.name
    from public.cases c
    join public.persons p on p.id = c.person_id
    join public.emergency_contacts ec on ec.person_id = c.person_id
    where ec.account_id = auth.uid()
  )
  select m.id, m.incident_id, m.name, e.created_at, e.action::text,
         case when e.action = 'resolved' then 'resolved' end, e.urgency, e.outcome
  from my_cases m join public.case_events e on e.case_id = m.id
  where e.action in ('opened', 'urgency_proposed', 'urgency_changed', 'resolved')
  union all
  select m.id, m.incident_id, m.name, r.created_at, r.kind::text,
         case when r.kind = 'check_in' then r.body ->> 'status' else 'cant_reach' end, null, null
  from my_cases m join public.reports r on r.case_id = m.id
  where r.kind in ('check_in', 'cant_reach')
  order by 4
$$;

-- Used by scripts/reset-demo.ts with the server key. Runs as the owner, the only role that
-- can delete Reports and Case events. Fails rather than orphan a non-demo row.
create function public.delete_demo_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.notifications where demo;
  delete from public.case_events where demo;
  delete from public.reports where demo;
  delete from public.cases where demo;
  delete from public.emergency_contacts where demo;
  delete from public.coordinators where demo;
  delete from public.persons where demo;
  delete from public.incidents where demo;
$$;

revoke execute on function public.my_person_ids, public.is_coordinator, public.contact_case_updates, public.delete_demo_data from public, anon;
grant execute on function public.my_person_ids, public.is_coordinator, public.contact_case_updates to authenticated;
revoke execute on function public.delete_demo_data from authenticated;
grant execute on function public.delete_demo_data to service_role;
