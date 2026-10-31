-- Two simultaneous deliveries of the same readings raise one Potential incident.
alter table public.potential_incidents add column readings_key text unique;
