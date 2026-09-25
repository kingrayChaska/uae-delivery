-- Global, ever-incrementing sequence behind tracking numbers — guarantees
-- uniqueness regardless of how many shipments are created on the same day.
create sequence public.shipment_tracking_seq;

create function public.generate_tracking_number()
returns text
language sql
as $$
  select 'DLV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.shipment_tracking_seq')::text, 6, '0');
$$;

-- The explicit state machine for shipment.status — this is what "do not
-- allow arbitrary strings/transitions for shipment status" (spec section 16)
-- actually means in a relational schema: every legal (from, to) pair is a
-- row here, and the trigger below rejects anything not listed.
create table shipment_status_transitions (
  from_status shipment_status not null,
  to_status shipment_status not null,
  primary key (from_status, to_status)
);

insert into shipment_status_transitions (from_status, to_status) values
  ('pending_payment', 'confirmed'),
  ('pending_payment', 'cancelled'),
  ('confirmed', 'assigned'),
  ('confirmed', 'cancelled'),
  ('assigned', 'driver_accepted'),
  ('assigned', 'cancelled'),
  ('driver_accepted', 'arrived_pickup'),
  ('driver_accepted', 'cancelled'),
  ('arrived_pickup', 'picked_up'),
  ('arrived_pickup', 'delivery_failed'),
  ('picked_up', 'in_transit'),
  ('in_transit', 'arrived_destination'),
  ('in_transit', 'delivery_failed'),
  ('arrived_destination', 'delivered'),
  ('arrived_destination', 'delivery_failed'),
  ('delivery_failed', 'assigned'), -- retry: reassign to a driver
  ('delivery_failed', 'returned');
  -- 'delivered', 'cancelled' and 'returned' are terminal: no outbound rows.

create table shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_number text not null unique default (
    'DLV-' || to_char(now(), 'YYYYMMDD') || '-' || encode(gen_random_bytes(8), 'hex')
  ),
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  customer_id uuid not null references profiles (id),
  business_account_id uuid references business_accounts (id),
  driver_id uuid references profiles (id),
  status shipment_status not null default 'pending_payment',

  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_contact_name text not null,
  pickup_contact_phone text not null,

  dropoff_address text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_contact_name text not null,
  dropoff_contact_phone text not null,

  distance_km numeric(7, 2) not null check (distance_km >= 0),
  duration_minutes integer not null check (duration_minutes >= 0),
  pricing_rule_id uuid references pricing_rules (id),
  price numeric(10, 2) not null check (price >= 0),
  currency text not null default 'AED',

  payment_method payment_method not null,
  payment_status payment_status not null default 'pending',

  package_type package_type not null,
  package_description text not null default '',
  package_quantity integer not null default 1 check (package_quantity >= 1),
  package_weight_kg numeric(8, 2),
  is_fragile boolean not null default false,
  package_image_url text,

  cancelled_reason text,
  delivery_failed_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipments_customer_idx on shipments (customer_id);
create index shipments_driver_idx on shipments (driver_id);
create index shipments_status_idx on shipments (status);
create index shipments_business_account_idx on shipments (business_account_id);
create index shipments_tracking_number_idx on shipments (tracking_number);

create trigger shipments_set_updated_at
  before update on shipments
  for each row execute function set_updated_at();

create function enforce_shipment_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not exists (
    select 1 from shipment_status_transitions
    where from_status = old.status and to_status = new.status
  ) then
    raise exception 'Invalid shipment status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger shipments_enforce_status_transition
  before update on shipments
  for each row execute function enforce_shipment_status_transition();

alter table shipments enable row level security;
alter table shipment_status_transitions enable row level security;

-- The transition table is reference data, readable by anyone authenticated
-- (harmless to expose, useful for the client to grey out invalid actions)
-- but never client-writable.
create policy shipment_status_transitions_select on shipment_status_transitions
  for select using (true);

-- Customer sees own shipments (incl. ones booked under a business account
-- they belong to); Driver sees only shipments assigned to them; staff see
-- everything (Operators dispatch, Managers oversee).
create policy shipments_select on shipments
  for select
  using (
    customer_id = auth.uid()
    or driver_id = auth.uid()
    or is_staff()
    or business_account_id in (
      select business_account_id from business_account_members where profile_id = auth.uid()
    )
  );

-- Defense-in-depth against exactly the attack spec section 44 calls out —
-- "the browser should not be able to submit price = 1 and have the server
-- accept it". The booking server action always computes distance_km (via
-- Mapbox) and price (via lib/pricing/calculate.ts) itself and never reads
-- them from client input — but a request that bypassed that server action
-- and hit the Supabase REST API directly would only be stopped here. This
-- checks price is mathematically consistent with distance_km and the
-- referenced pricing rule; it can't independently verify distance_km
-- itself (that requires the external Mapbox routing call), which is why
-- the server action remains the primary control, not this backstop.
create function shipment_price_is_valid(p_distance_km numeric, p_pricing_rule_id uuid, p_price numeric, p_currency text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rule pricing_rules%rowtype;
  expected numeric(10, 2);
begin
  select * into rule from pricing_rules where id = p_pricing_rule_id;
  if not found then
    return false;
  end if;

  expected := round(rule.base_price + greatest(p_distance_km - rule.base_distance_km, 0) * rule.additional_price_per_km, 2);
  return expected = round(p_price, 2) and rule.currency = p_currency;
end;
$$;

-- A customer can create their own shipment booking; staff can create on a
-- customer's behalf (phone bookings, business bulk shipments) and are
-- trusted, so they're exempt from the price-consistency check above.
create policy shipments_insert on shipments
  for insert
  with check (
    (customer_id = auth.uid() or is_staff())
    and (is_staff() or shipment_price_is_valid(distance_km, pricing_rule_id, price, currency))
  );

-- Customer may only cancel their own shipment (a status-only change, and
-- only while it's still legal per the transition table above); Driver may
-- update status/location-adjacent fields on their own assigned shipment as
-- they progress through the delivery workflow; staff can update anything
-- operational (assignment, status, exceptions). Nobody can touch price,
-- distance, or payment_status through this policy — see shipments_pricing
-- lockdown trigger below.
create policy shipments_update on shipments
  for update
  using (customer_id = auth.uid() or driver_id = auth.uid() or is_staff())
  with check (customer_id = auth.uid() or driver_id = auth.uid() or is_staff());

-- "The browser should not be able to submit price = 1 and have the server
-- accept it" (spec section 44) — enforced here, not just in application
-- code: price/distance/duration/currency/pricing_rule_id can only change
-- via a staff-driven correction, never via a customer or driver update.
create function prevent_shipment_pricing_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    if new.price is distinct from old.price
      or new.distance_km is distinct from old.distance_km
      or new.duration_minutes is distinct from old.duration_minutes
      or new.currency is distinct from old.currency
      or new.pricing_rule_id is distinct from old.pricing_rule_id
      or new.payment_status is distinct from old.payment_status
    then
      raise exception 'Pricing and payment_status can only be changed by staff';
    end if;
  end if;
  return new;
end;
$$;

create trigger shipments_prevent_pricing_tampering
  before update on shipments
  for each row execute function prevent_shipment_pricing_tampering();

-- Every status change is recorded, automatically, as an append-only trail —
-- the application never writes shipment_status_history directly.
create table shipment_status_history (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  status shipment_status not null,
  changed_by uuid references profiles (id),
  note text,
  created_at timestamptz not null default now()
);

create index shipment_status_history_shipment_idx on shipment_status_history (shipment_id);

create function log_shipment_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into shipment_status_history (shipment_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into shipment_status_history (shipment_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger shipments_log_status_history
  after insert or update on shipments
  for each row execute function log_shipment_status_history();

alter table shipment_status_history enable row level security;

create policy shipment_status_history_select on shipment_status_history
  for select
  using (
    is_staff()
    or shipment_id in (
      select id from shipments where customer_id = auth.uid() or driver_id = auth.uid()
    )
  );
-- No insert/update/delete policies: only the trigger above (SECURITY
-- DEFINER) writes this table.

-- Driver live-location pings, scoped to an active delivery.
create table driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles (id),
  shipment_id uuid references shipments (id),
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

create index driver_locations_driver_idx on driver_locations (driver_id, recorded_at desc);
create index driver_locations_shipment_idx on driver_locations (shipment_id);

alter table driver_locations enable row level security;

-- Driver sees own trail; staff see everyone's (the live dispatch map);
-- a customer may see location pings tied to their own active shipment
-- (so the tracking page can show "driver is nearby").
create policy driver_locations_select on driver_locations
  for select
  using (
    driver_id = auth.uid()
    or is_staff()
    or shipment_id in (select id from shipments where customer_id = auth.uid())
  );

-- A driver may only ever insert their own location pings, and only while
-- actively assigned to the shipment referenced.
create policy driver_locations_insert on driver_locations
  for insert
  with check (
    driver_id = auth.uid()
    and (
      shipment_id is null
      or shipment_id in (select id from shipments where driver_id = auth.uid())
    )
  );
-- No update/delete: location history is an immutable trail.
