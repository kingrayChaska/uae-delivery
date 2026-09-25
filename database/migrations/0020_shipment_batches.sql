-- Bulk shipment lists. A business customer (or any customer shipping in
-- volume) submits many shipments at once; each list is a shipment_batches
-- row, and every shipment it produced points back at it via
-- shipments.batch_id. Operators and managers see each list as one unit —
-- who sent it, when they want it collected, how many parcels, what failed
-- — instead of 50 unrelated rows in the shipment queue.
--
-- Shipments themselves are still created one at a time through the normal
-- createShipment() path (server-side geocoding, routing and pricing, plus
-- the RLS price check), so a batch gets no pricing shortcut.

create table shipment_batches (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default (
    'BLK-' || to_char(now(), 'YYYYMMDD') || '-' || upper(encode(gen_random_bytes(4), 'hex'))
  ),
  name text not null check (char_length(name) between 2 and 120),
  customer_id uuid not null references profiles (id),
  business_account_id uuid references business_accounts (id),
  created_by uuid not null references profiles (id),
  pickup_date date,
  notes text not null default '' check (char_length(notes) <= 1000),
  -- 'processing' while rows are being created; the server finalizes it
  -- (with the service-role client) once every row has been attempted.
  status text not null default 'processing'
    check (status in ('processing', 'submitted', 'partially_failed', 'failed')),
  rows_submitted integer not null default 0 check (rows_submitted >= 0),
  rows_failed integer not null default 0 check (rows_failed >= 0),
  failed_rows jsonb not null default '[]'::jsonb,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipment_batches_customer_idx on shipment_batches (customer_id, created_at desc);
create index shipment_batches_created_idx on shipment_batches (created_at desc);
create index shipment_batches_business_account_idx on shipment_batches (business_account_id);

-- A double-click or retry of the same submission reuses the first batch.
create unique index shipment_batches_customer_request_unique
  on shipment_batches (customer_id, client_request_id)
  where client_request_id is not null;

create trigger shipment_batches_set_updated_at
  before update on shipment_batches
  for each row execute function set_updated_at();

alter table shipment_batches enable row level security;

-- Same visibility as the shipments inside it.
create policy shipment_batches_select on shipment_batches
  for select
  using (
    customer_id = auth.uid()
    or is_staff()
    or business_account_id in (
      select business_account_id from business_account_members where profile_id = auth.uid()
    )
  );

-- A customer may open a batch for themselves, only in its initial state,
-- and only tagged to a business they actually belong to. Staff may open one
-- on a customer's behalf (the manager business-account bulk upload).
create policy shipment_batches_insert on shipment_batches
  for insert
  with check (
    is_staff()
    or (
      customer_id = auth.uid()
      and created_by = auth.uid()
      and status = 'processing'
      and rows_submitted = 0
      and rows_failed = 0
      and failed_rows = '[]'::jsonb
      and (
        business_account_id is null
        or business_account_id in (
          select business_account_id from business_account_members where profile_id = auth.uid()
        )
      )
    )
  );
-- No update/delete policies: finalizing a batch (counts, failed rows,
-- status) is done by trusted server code with the service-role client.

-- ── shipments.batch_id ───────────────────────────────────────────────────

alter table shipments add column batch_id uuid references shipment_batches (id);
create index shipments_batch_idx on shipments (batch_id);

-- A shipment can only join a batch that belongs to the same customer and is
-- still open — otherwise a customer calling the REST API directly could
-- slip shipments into someone else's list. Applies to every caller,
-- staff included: a batch is one customer's list by definition.
create function enforce_shipment_batch_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.batch_id is null then
    return new;
  end if;

  if not exists (
    select 1 from shipment_batches
    where id = new.batch_id
      and customer_id = new.customer_id
      and status = 'processing'
  ) then
    raise exception 'Shipment cannot be added to this batch';
  end if;

  return new;
end;
$$;

create trigger shipments_enforce_batch_ownership
  before insert on shipments
  for each row execute function enforce_shipment_batch_ownership();

-- ── Notifications ────────────────────────────────────────────────────────
-- Without this, a 50-row list would send the customer 50 "Booking created"
-- notifications and every operator/manager 50 "ready for dispatch" ones.
-- Batch shipments are skipped here and announced once, when the batch is
-- finalized (trigger below).
create or replace function notify_shipment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.batch_id is not null then
    return new;
  end if;

  insert into notifications (profile_id, type, title, body)
  values (
    new.customer_id, 'shipment.booked', 'Booking created',
    'Your shipment ' || new.tracking_number || ' has been booked.'
  );

  -- COD bookings start life already 'confirmed' (no payment to wait on) —
  -- that's the point at which dispatch can actually act on them.
  if new.status = 'confirmed' then
    perform notify_operators(
      'shipment.ready_for_dispatch', 'New shipment ready for dispatch',
      new.tracking_number || ' is confirmed and awaiting a driver.'
    );
  end if;

  return new;
end;
$$;

create function notify_shipment_batch_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created integer;
  v_sender text;
begin
  if old.status <> 'processing' or new.status = 'processing' then
    return new;
  end if;

  v_created := new.rows_submitted - new.rows_failed;

  select coalesce(ba.company_name, p.full_name) into v_sender
  from profiles p
  left join business_accounts ba on ba.id = new.business_account_id
  where p.id = new.customer_id;

  insert into notifications (profile_id, type, title, body)
  values (
    new.customer_id, 'batch.submitted', 'Bulk list submitted',
    new.reference || ' (' || new.name || '): ' || v_created || ' of ' || new.rows_submitted || ' shipments created.'
  );

  if v_created > 0 then
    perform notify_operators(
      'batch.submitted', 'New bulk shipment list',
      coalesce(v_sender, 'A customer') || ' submitted ' || new.reference || ' with ' || v_created || ' shipments'
        || coalesce(' for pickup on ' || to_char(new.pickup_date, 'DD Mon YYYY'), '') || '.'
    );
  end if;

  return new;
end;
$$;

create trigger shipment_batches_notify_submitted
  after update on shipment_batches
  for each row execute function notify_shipment_batch_submitted();

-- 0018 changed default privileges so new functions start with no EXECUTE
-- grant; these are trigger functions only and need none.
