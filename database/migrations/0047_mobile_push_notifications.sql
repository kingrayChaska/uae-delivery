-- Mobile push notifications: the ParcelLink app (mobile/) gets a push for
-- each in-app notification its signed-in staff member receives.
--
-- Additive only. No existing table, policy or trigger changes: the in-app
-- notifications (0009, 0017, 0020, …) stay exactly as they are, and pushes
-- are read from them afterwards, so a push problem can never fail or slow
-- down the action that created the notification.
--
--   mobile_push_devices          each signed-in phone's Expo push token
--   notification_push_deliveries one row per notification pushed (or tried):
--                                the outbox state, so nothing is sent twice
--
-- The app registers its token through register_push_device() (the caller's
-- own session; active drivers, operators and managers only) and removes it
-- on sign-out through unregister_push_device(). The website's push worker
-- (services/notifications/push-delivery.ts, service role) claims recent
-- notifications for people with a device, sends them through Expo's push
-- service, and records the outcome.

-- ── Devices ──────────────────────────────────────────────────────────────

create table mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  -- One token is one app install; it belongs to whoever signed in on it last.
  expo_push_token text not null unique
    check (expo_push_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  platform text not null check (platform in ('ios', 'android')),
  -- false: Expo reported the token as no longer registered.
  enabled boolean not null default true,
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 100),
  created_at timestamptz not null default now(),
  last_registered_at timestamptz not null default now()
);

create index mobile_push_devices_profile_idx on mobile_push_devices (profile_id) where enabled;

alter table mobile_push_devices enable row level security;

-- People see their own devices; nobody writes rows directly (the functions
-- below are the only way in).
create policy mobile_push_devices_select on mobile_push_devices
  for select using (profile_id = auth.uid());

create function register_push_device(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from profiles
    where id = v_uid and active and role in ('driver', 'operator', 'manager') and deleted_at is null
  ) then
    raise exception 'Only active staff accounts can receive app notifications';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'Choose ios or android';
  end if;

  insert into mobile_push_devices (profile_id, expo_push_token, platform)
  values (v_uid, p_token, p_platform)
  on conflict (expo_push_token) do update
    set profile_id = excluded.profile_id,
        platform = excluded.platform,
        enabled = true,
        disabled_reason = null,
        last_registered_at = now();
end;
$$;

create function unregister_push_device(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from mobile_push_devices where expo_push_token = p_token and profile_id = auth.uid();
end;
$$;

revoke execute on function register_push_device(text, text) from public, anon;
revoke execute on function unregister_push_device(text) from public, anon;
grant execute on function register_push_device(text, text) to authenticated;
grant execute on function unregister_push_device(text) to authenticated;

-- ── Outbox ───────────────────────────────────────────────────────────────

create table notification_push_deliveries (
  notification_id uuid primary key references notifications (id) on delete cascade,
  -- sending: claimed by a worker until locked_until
  -- sent: Expo accepted it for at least one device (NOT a delivery receipt)
  -- failed: gave up (every device refused, or too many attempts)
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  sent_at timestamptz,
  -- A short machine-readable reason (e.g. "http_503"), never message content.
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now()
);

-- Service role only: no policies.
alter table notification_push_deliveries enable row level security;

-- Hands each due notification to exactly one worker. Candidates are recent
-- notifications (p_max_age_minutes) for active staff with an enabled device
-- and no finished delivery — read per device owner through the existing
-- (profile_id, created_at) index, so the cost follows the number of app
-- users, not the size of the notifications table. A claimed row is leased;
-- a worker that dies mid-send leaves it 'sending' until the lease runs out.
-- Rows that already used p_max_attempts are never handed out again.
create function claim_push_notifications(
  p_limit integer,
  p_lease_seconds integer,
  p_max_attempts integer,
  p_max_age_minutes integer
)
returns table (
  notification_id uuid,
  profile_id uuid,
  type text,
  title text,
  body text,
  attempts integer,
  tokens text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with owners as (
    select distinct d.profile_id
    from mobile_push_devices d
    join profiles p on p.id = d.profile_id
    where d.enabled and p.active and p.deleted_at is null
  ),
  candidates as (
    select n.id
    from owners o
    join notifications n
      on n.profile_id = o.profile_id
     and n.created_at > now() - make_interval(mins => greatest(p_max_age_minutes, 1))
    left join notification_push_deliveries q on q.notification_id = n.id
    where q.notification_id is null
       or (q.status = 'sending' and q.locked_until < now() and q.attempts < p_max_attempts)
    order by n.created_at
    limit greatest(least(p_limit, 100), 1)
  ),
  claimed as (
    insert into notification_push_deliveries as q (notification_id, status, attempts, locked_until)
    select c.id, 'sending', 1, now() + make_interval(secs => greatest(p_lease_seconds, 30))
    from candidates c
    on conflict on constraint notification_push_deliveries_pkey do update
      set attempts = q.attempts + 1,
          locked_until = excluded.locked_until
      where q.status = 'sending' and q.locked_until < now() and q.attempts < p_max_attempts
    returning q.notification_id, q.attempts
  )
  select n.id, n.profile_id, n.type, n.title, n.body, c.attempts,
    array(
      select d.expo_push_token from mobile_push_devices d
      where d.profile_id = n.profile_id and d.enabled
      order by d.last_registered_at desc
    )
  from claimed c
  join notifications n on n.id = c.notification_id;
end;
$$;

revoke execute on function claim_push_notifications(integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function claim_push_notifications(integer, integer, integer, integer) to service_role;
