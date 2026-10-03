-- Merchant bulk shipments: a merchant uploads a CSV, every row is validated,
-- resolved (Google), coverage-checked, routed and priced on the server, the
-- merchant reviews and fixes rows, and only then books them — as ordinary
-- shipments in one shipment_batches row (migration 0020), so the manager
-- and operator dashboards handle them like any other booking.
--
-- Additive: existing batches, shipments and booking paths are unchanged.

-- ── 1. Batch lifecycle ───────────────────────────────────────────────────
-- 'draft'      rows uploaded and being validated/reviewed; no shipments yet.
-- 'processing' (existing) shipments are being created.
-- 'submitted' / 'partially_failed' / 'failed' (existing) booked.
-- 'cancelled'  a draft the merchant discarded; never had shipments.
-- Shipments can still only join a 'processing' batch
-- (enforce_shipment_batch_ownership), so a draft can never hold shipments.

alter table shipment_batches drop constraint shipment_batches_status_check;
alter table shipment_batches add constraint shipment_batches_status_check
  check (status in ('draft', 'processing', 'submitted', 'partially_failed', 'failed', 'cancelled'));

alter table shipment_batches
  add column file_name text check (file_name is null or char_length(file_name) <= 200),
  add column booked_at timestamptz,
  -- Why the last booking attempt was refused (shown on the review screen).
  add column booking_error text check (booking_error is null or char_length(booking_error) <= 1000);

-- A customer may also open a batch as a draft (the merchant CSV upload).
-- Everything after that — rows, status changes, totals — is written by
-- trusted server code with the service-role client.
drop policy shipment_batches_insert on shipment_batches;
create policy shipment_batches_insert on shipment_batches
  for insert
  with check (
    (select is_staff())
    or (
      customer_id = (select auth.uid())
      and created_by = (select auth.uid())
      and status in ('processing', 'draft')
      and rows_submitted = 0
      and rows_failed = 0
      and failed_rows = '[]'::jsonb
      and booked_at is null
      and booking_error is null
      and (
        business_account_id is null
        or business_account_id in (
          select business_account_id from business_account_members where profile_id = (select auth.uid())
        )
      )
    )
  );

-- A booking that fails goes back from 'processing' to 'draft' so the
-- merchant can fix it and try again; that must not announce "booked".
create or replace function notify_shipment_batch_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created integer;
  v_sender text;
begin
  if old.status <> 'processing' or new.status in ('processing', 'draft', 'cancelled') then
    return new;
  end if;

  v_created := new.rows_submitted - new.rows_failed;

  select coalesce(ba.company_name, p.full_name) into v_sender
  from profiles p
  left join business_accounts ba on ba.id = new.business_account_id
  where p.id = new.customer_id;

  insert into notifications (profile_id, type, title, body, data)
  values (
    new.customer_id, 'batch.submitted', 'Shipments booked',
    new.reference || ': ' || v_created || ' of ' || new.rows_submitted || ' shipments booked.',
    jsonb_build_object('batchId', new.id)
  );

  if v_created > 0 then
    perform notify_operators(
      'batch.submitted', 'New multi-shipment booking',
      coalesce(v_sender, 'A customer') || ' booked ' || v_created || ' shipments (' || new.reference || ')'
        || coalesce(' for pickup on ' || to_char(new.pickup_date, 'DD Mon YYYY'), '') || '.'
    );
  end if;

  return new;
end;
$$;

-- ── 2. Uploaded rows (the review stage) ──────────────────────────────────
-- One row per CSV line of a draft batch. `input` is what the merchant
-- wrote (by template column); `quote` is what the SERVER worked out from
-- it — Google's resolved addresses, coordinates and Place IDs, the
-- confirmed emirates, the route distance and the price breakdown. Booking
-- builds shipments from `quote`, never from anything the browser sends, so
-- this table has no client write policies at all: only the service-role
-- client (after the server has checked the merchant owns the batch)
-- writes here.

create table shipment_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references shipment_batches (id) on delete cascade,
  row_number integer not null check (row_number >= 1),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  -- Same normalized input = a duplicate row (flagged as a warning).
  input_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'valid', 'warning', 'invalid')),
  -- [{ field, message, severity: 'error' | 'warning' }]
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  quote jsonb check (quote is null or jsonb_typeof(quote) = 'object'),
  -- Copied out of `quote` for sorting and totals.
  distance_km numeric(7, 2),
  delivery_fee numeric(10, 2),
  cod_amount numeric(10, 2),
  coverage text check (coverage is null or coverage in ('active', 'contact_support', 'unverified', 'outside_uae')),
  processed_at timestamptz,
  -- Set when a worker takes a pending row (claim_batch_rows); a claim
  -- older than two minutes is treated as abandoned and taken again.
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index shipment_batch_rows_pending_idx on shipment_batch_rows (batch_id, row_number) where status = 'pending';
create index shipment_batch_rows_hash_idx on shipment_batch_rows (batch_id, input_hash);

create trigger shipment_batch_rows_set_updated_at
  before update on shipment_batch_rows
  for each row execute function set_updated_at();

alter table shipment_batch_rows enable row level security;

-- Readable by whoever can read the batch: its merchant (and their
-- business's members) and staff.
create policy shipment_batch_rows_select on shipment_batch_rows
  for select
  using (
    batch_id in (
      select id from shipment_batches
      where customer_id = (select auth.uid())
        or (select is_staff())
        or business_account_id in (
          select business_account_id from business_account_members where profile_id = (select auth.uid())
        )
    )
  );
-- No insert/update/delete policies: service-role only (see above).

-- The validation queue. Rows are checked by whichever worker gets them
-- first — the merchant's open browser tab, or the background worker that
-- keeps going after the tab is closed. FOR UPDATE SKIP LOCKED hands each
-- pending row to exactly one of them. Only rows of draft batches are
-- handed out. p_batch_id null = any draft batch (the background sweep).
create function claim_batch_rows(p_batch_id uuid, p_limit integer)
returns setof shipment_batch_rows
language sql
volatile
security definer
set search_path = public
as $$
  update shipment_batch_rows r
  set claimed_at = now()
  where r.id in (
    select c.id
    from shipment_batch_rows c
    join shipment_batches b on b.id = c.batch_id
    where c.status = 'pending'
      and b.status = 'draft'
      and (p_batch_id is null or c.batch_id = p_batch_id)
      and (c.claimed_at is null or c.claimed_at < now() - interval '2 minutes')
    order by c.batch_id, c.row_number
    limit least(greatest(p_limit, 1), 100)
    for update of c skip locked
  )
  returning r.*;
$$;

revoke execute on function claim_batch_rows(uuid, integer) from public, anon, authenticated;
grant execute on function claim_batch_rows(uuid, integer) to service_role;

-- ── Shared Google Maps cache ─────────────────────────────────────────────
-- Resolved CSV addresses and driving routes, shared by every server
-- instance, so a repeated address or route is never paid for twice (and a
-- re-uploaded file is priced on exactly the same route). Entries expire
-- within a day — well inside what Google's terms allow for cached
-- coordinates. Server-only: RLS on, no policies.
create table maps_cache (
  key text primary key check (char_length(key) <= 1000),
  value jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index maps_cache_expires_idx on maps_cache (expires_at);

alter table maps_cache enable row level security;

-- ── 3. Requested delivery date ───────────────────────────────────────────
-- The day the merchant wants the shipment delivered (UAE calendar day).
-- Nullable: single bookings don't set one. Customers can't change it after
-- booking — enforce_shipment_update_permissions (0015) masks the whole row.
alter table shipments add column delivery_date date;
create index shipments_delivery_date_idx on shipments (delivery_date) where delivery_date is not null;
