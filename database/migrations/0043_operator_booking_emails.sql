-- Operator booking emails: the operations inbox gets an email whenever a
-- customer — individual or merchant — books a shipment themselves.
--
-- A transactional outbox. Shipments reach the database through several
-- code paths (single booking, multi-shipment booking, merchant CSV bulk),
-- so, like the in-app notifications (0017, 0020), the queue is filled by
-- triggers: one place that sees every path, in the same transaction as the
-- booking, so an email is queued exactly when a booking commits and never
-- for one that rolled back. The app sends the emails afterwards
-- (services/notifications/operator-booking-emails.ts).
--
-- What is queued:
--   * a shipment the customer booked for themselves, outside a batch —
--     inserted with the customer's own session (auth.uid() = customer_id);
--   * a batch (multi-shipment booking or merchant bulk list) the customer
--     opened themselves, once, when it leaves 'processing' with at least
--     one shipment booked — one summary email, not one per parcel.
-- Not queued: anything staff entered (on a customer's behalf, guest
-- bookings, the manager's CSV upload) — operators already know about those
-- — and any later edit, reassignment or status change (INSERT / the one
-- batch transition only).
--
-- The unique shipment_id / batch_id make a second queue row for the same
-- booking impossible, whatever retries or replays happen upstream.

create table operator_booking_emails (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid unique references shipments (id) on delete cascade,
  batch_id uuid unique references shipment_batches (id) on delete cascade,
  -- pending: waiting to be sent (first time or a scheduled retry)
  -- sending: claimed by a worker until locked_until
  -- accepted: the provider accepted it (NOT a delivery confirmation)
  -- failed: gave up (permanent provider error, too many attempts, expired)
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'accepted', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  -- A short machine-readable reason (e.g. "http_503"), never message content.
  last_error text check (last_error is null or char_length(last_error) <= 200),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(shipment_id, batch_id) = 1)
);

create index operator_booking_emails_due_idx
  on operator_booking_emails (next_attempt_at)
  where status in ('pending', 'sending');

create trigger operator_booking_emails_set_updated_at
  before update on operator_booking_emails
  for each row execute function set_updated_at();

-- Service role only: RLS on, no policies, no grants. No client session can
-- read the queue, add to it, or point an email anywhere — the recipient is
-- server configuration, not data.
alter table operator_booking_emails enable row level security;
revoke all on operator_booking_emails from anon, authenticated;

-- ── Queueing ─────────────────────────────────────────────────────────────

create function queue_operator_booking_email_for_shipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.batch_id is null
    and new.booked_by is null
    and new.customer_id is not null
    and new.customer_id = auth.uid()
  then
    insert into operator_booking_emails (shipment_id) values (new.id)
    on conflict (shipment_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger shipments_queue_operator_booking_email
  after insert on shipments
  for each row execute function queue_operator_booking_email_for_shipment();

-- Same transition as notify_shipment_batch_submitted (0026): leaving
-- 'processing' for a booked state. A merchant booking that fails goes back
-- to 'draft' and may be booked again later; the unique batch_id still
-- allows only one email.
create function queue_operator_booking_email_for_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'processing'
    and new.status in ('submitted', 'partially_failed')
    and new.created_by = new.customer_id
    and new.rows_submitted - new.rows_failed > 0
  then
    insert into operator_booking_emails (batch_id) values (new.id)
    on conflict (batch_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger shipment_batches_queue_operator_booking_email
  after update on shipment_batches
  for each row execute function queue_operator_booking_email_for_batch();

-- ── Sending ──────────────────────────────────────────────────────────────

-- Hands each due email to exactly one worker: rows are locked with SKIP
-- LOCKED, marked 'sending' with a lease, and their attempt counted before
-- anything is sent. A worker that dies mid-send leaves the row 'sending';
-- once the lease runs out it is due again. Rows that already used
-- p_max_attempts are never handed out again.
create function claim_operator_booking_emails(
  p_limit integer,
  p_lease_seconds integer,
  p_max_attempts integer
)
returns setof operator_booking_emails
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update operator_booking_emails e
  set status = 'sending',
      attempts = e.attempts + 1,
      locked_until = now() + make_interval(secs => greatest(p_lease_seconds, 30))
  where e.id in (
    select c.id
    from operator_booking_emails c
    where c.next_attempt_at <= now()
      and c.attempts < p_max_attempts
      and (c.status = 'pending' or (c.status = 'sending' and c.locked_until < now()))
    order by c.next_attempt_at
    limit greatest(least(p_limit, 50), 1)
    for update skip locked
  )
  returning e.*;
end;
$$;

revoke execute on function claim_operator_booking_emails(integer, integer, integer) from public, anon, authenticated;
grant execute on function claim_operator_booking_emails(integer, integer, integer) to service_role;
