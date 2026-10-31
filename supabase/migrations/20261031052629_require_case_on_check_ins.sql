-- A Check-in or Can't-reach report without its Case would never reach the Case's status
-- or the Emergency Contact, so the database refuses one.
alter table public.reports
  add check (kind not in ('check_in', 'cant_reach') or case_id is not null);
