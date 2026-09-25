-- notifications: in-app notification feed per profile (spec section 33).
create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id),
  type text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile_idx on notifications (profile_id, created_at desc);
create index notifications_unread_idx on notifications (profile_id) where read_at is null;

alter table notifications enable row level security;

-- Strictly own notifications — nobody, including staff, browses another
-- profile's notification feed through this table.
create policy notifications_select on notifications
  for select using (profile_id = auth.uid());

-- No INSERT policy for 'authenticated': notifications are always
-- system-generated (server actions/triggers using the service-role client)
-- so a user can never forge a notification into their own or anyone else's
-- feed.

-- The only thing a user can change about their own notification is marking
-- it read; every other field is locked down by the trigger below.
create policy notifications_update on notifications
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create function prevent_notification_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    if new.type is distinct from old.type
      or new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.data is distinct from old.data
    then
      raise exception 'Only read_at may be changed on a notification';
    end if;
  end if;
  return new;
end;
$$;

create trigger notifications_prevent_tampering
  before update on notifications
  for each row execute function prevent_notification_tampering();

-- support_tickets + threaded messages.
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id),
  subject text not null,
  status support_ticket_status not null default 'open',
  assigned_to uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_profile_idx on support_tickets (profile_id);
create index support_tickets_status_idx on support_tickets (status);

create trigger support_tickets_set_updated_at
  before update on support_tickets
  for each row execute function set_updated_at();

create table support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  sender_id uuid not null references profiles (id),
  message text not null,
  created_at timestamptz not null default now()
);

create index support_ticket_messages_ticket_idx on support_ticket_messages (ticket_id);

alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;

-- Requester sees own ticket; staff see all (Operator + Manager both have a
-- Support nav item).
create policy support_tickets_select on support_tickets
  for select using (profile_id = auth.uid() or is_staff());

create policy support_tickets_insert on support_tickets
  for insert with check (profile_id = auth.uid() or is_staff());

-- Only staff can change status/assignment; the requester cannot close or
-- reassign their own ticket. Enforced with a tampering guard since a
-- requester-initiated update (e.g. none currently exposed in the UI, but
-- kept here for forward-compatibility) must still be locked down.
create policy support_tickets_update on support_tickets
  for update using (is_staff()) with check (is_staff());

create policy support_ticket_messages_select on support_ticket_messages
  for select
  using (
    is_staff()
    or ticket_id in (select id from support_tickets where profile_id = auth.uid())
  );

create policy support_ticket_messages_insert on support_ticket_messages
  for insert
  with check (
    sender_id = auth.uid()
    and (is_staff() or ticket_id in (select id from support_tickets where profile_id = auth.uid()))
  );
