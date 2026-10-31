-- An Account marks its own Notifications read. A function rather than an update policy,
-- so read_at is the only column a client can change.
create function public.mark_notifications_read(p_ids uuid[])
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where id = any(p_ids) and account_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
