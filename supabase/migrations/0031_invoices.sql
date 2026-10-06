-- Invoices for individual shipments, merchant shipments and merchant bulk
-- shipments (one invoice for a whole batch).
--
-- An invoice is a financial document, so it is a SNAPSHOT: the billed-to
-- details, every line and every amount are copied from the shipments when
-- the invoice is issued and never change afterwards, even if a shipment is
-- later edited or cancelled. Amounts come from the stored, already
-- price-checked shipment columns (price and its breakdown, migration 0022) —
-- nothing is recalculated and nothing comes from the browser.
--
-- Writes: only issue_shipment_invoice() / issue_batch_invoice() below
-- (SECURITY DEFINER). There are no INSERT/UPDATE/DELETE policies at all, and
-- triggers refuse changes to an issued invoice from every caller (service
-- role included). The one permitted change is status 'issued' -> 'void'
-- (with voided_at/void_reason), the hook for an explicit, audited
-- regeneration: void the old invoice, issue a new one; both stay on record.
--
-- Reads: the same people who can read the shipments — the customer who
-- booked, members of the business account it was booked under, and staff.
--
-- Who is billed for what:
--   individual_shipment  a shipment booked by an individual account
--   merchant_shipment    a merchant's shipment that isn't part of a batch
--   bulk_shipment        a merchant's batch: ONE invoice for all of its
--                        shipments. A merchant's batched shipment is billed
--                        only here, so no shipment is ever invoiced twice.
-- "Merchant" is the booking customer's account_type when the invoice is
-- issued.

-- ── Numbering ────────────────────────────────────────────────────────────
-- INV-2026-000123: sequential, unique, and says nothing about internal ids.
create sequence invoice_number_seq;

create function next_invoice_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'INV-' || to_char(now() at time zone 'Asia/Dubai', 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
$$;

-- ── Tables ───────────────────────────────────────────────────────────────

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  invoice_type text not null
    check (invoice_type in ('individual_shipment', 'merchant_shipment', 'bulk_shipment')),
  customer_id uuid not null references profiles (id),
  business_account_id uuid references business_accounts (id),
  shipment_id uuid references shipments (id),
  batch_id uuid references shipment_batches (id),
  status text not null default 'issued' check (status in ('issued', 'void')),
  -- Who is billed, as it was when issued: name, email, phone, and for a
  -- merchant the company, contact person, address and registration details.
  billed_to jsonb not null check (jsonb_typeof(billed_to) = 'object'),
  -- The tracking number (shipment invoices) or batch reference (bulk).
  reference text not null,
  -- Bulk only: batch name and its shared pickup address, when it has one.
  batch_name text,
  pickup_address text,
  shipment_count integer not null check (shipment_count >= 1),
  -- subtotal = delivery service charges (base + distance);
  -- additional_charges = weight and cash-on-delivery handling charges.
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  additional_charges numeric(12, 2) not null default 0 check (additional_charges >= 0),
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  total numeric(12, 2) not null check (total >= 0),
  currency text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references profiles (id),
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_total_matches check (total = subtotal + additional_charges - discount_total),
  constraint invoices_subject check (
    (invoice_type = 'bulk_shipment' and batch_id is not null and shipment_id is null)
    or (invoice_type <> 'bulk_shipment' and shipment_id is not null and batch_id is null)
  ),
  constraint invoices_void_state check ((status = 'void') = (voided_at is not null))
);

-- At most one live invoice per shipment and per batch; a void one may be
-- followed by a new one. These also serve "the invoice for this shipment".
create unique index invoices_active_shipment_unique on invoices (shipment_id) where status = 'issued' and shipment_id is not null;
create unique index invoices_active_batch_unique on invoices (batch_id) where status = 'issued' and batch_id is not null;
create index invoices_customer_issued_idx on invoices (customer_id, issued_at desc);
create index invoices_business_issued_idx on invoices (business_account_id, issued_at desc) where business_account_id is not null;

create trigger invoices_set_updated_at
  before update on invoices
  for each row execute function set_updated_at();

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id),
  line_number integer not null check (line_number >= 1),
  shipment_id uuid not null references shipments (id),
  tracking_number text not null,
  booked_at timestamptz not null,
  pickup_address text not null,
  dropoff_address text not null,
  recipient_name text not null,
  delivery_type delivery_type,
  package_type package_type not null,
  description text not null,
  quantity integer not null check (quantity >= 1),
  weight_kg numeric(8, 2),
  distance_km numeric(7, 2) not null,
  payment_method payment_method not null,
  -- Shown when the shipment stored its breakdown (every booking since 0022).
  base_charge numeric(10, 2),
  distance_charge numeric(10, 2),
  service_charge numeric(10, 2) not null check (service_charge >= 0),
  weight_charge numeric(10, 2) not null default 0 check (weight_charge >= 0),
  cod_charge numeric(10, 2) not null default 0 check (cod_charge >= 0),
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null,
  unique (invoice_id, line_number),
  constraint invoice_line_items_amount_matches check (amount = service_charge + weight_charge + cod_charge)
);

create index invoice_line_items_shipment_idx on invoice_line_items (shipment_id);

-- ── Immutability ─────────────────────────────────────────────────────────
-- Applies to every caller, the service role included: an issued invoice's
-- content can't be edited or deleted, only voided.

create function enforce_invoice_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Invoices cannot be deleted';
  end if;

  if old.status = 'void' then
    raise exception 'A void invoice cannot be changed';
  end if;

  if (to_jsonb(new) - array['status', 'voided_at', 'void_reason', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'voided_at', 'void_reason', 'updated_at']) then
    raise exception 'Issued invoices cannot be changed';
  end if;

  return new;
end;
$$;

create trigger invoices_immutable
  before update or delete on invoices
  for each row execute function enforce_invoice_immutability();

create function enforce_invoice_line_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Issued invoices cannot be changed';
end;
$$;

create trigger invoice_line_items_immutable
  before update or delete on invoice_line_items
  for each row execute function enforce_invoice_line_immutability();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

-- Same audience as the shipments themselves (shipments_select).
create policy invoices_select on invoices
  for select
  using (
    customer_id = (select auth.uid())
    or (select is_staff())
    or business_account_id in (
      select business_account_id from business_account_members where profile_id = (select auth.uid())
    )
  );

-- Lines follow their invoice (the subquery runs under invoices' own RLS).
create policy invoice_line_items_select on invoice_line_items
  for select
  using (invoice_id in (select id from invoices));

-- No INSERT/UPDATE/DELETE policies: invoices are written only by the
-- functions below.
revoke all on invoices, invoice_line_items from anon;
revoke insert, update, delete on invoices, invoice_line_items from authenticated;

-- ── Issuing ──────────────────────────────────────────────────────────────

-- May the caller bill this customer / business? The customer themselves,
-- or a member of the business account the shipment or batch belongs to.
create function invoice_caller_may_issue(p_customer_id uuid, p_business_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      p_customer_id = auth.uid()
      or (
        p_business_account_id is not null
        and exists (
          select 1 from business_account_members
          where business_account_id = p_business_account_id and profile_id = auth.uid()
        )
      )
    );
$$;

-- Who an invoice is addressed to. A merchant is billed as their company
-- (the business account the shipment was booked under, else their own).
create function invoice_billed_to(p_customer_id uuid, p_business_account_id uuid, p_merchant boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
  v_business business_accounts%rowtype;
begin
  select * into v_profile from profiles where id = p_customer_id;

  if p_merchant then
    if p_business_account_id is not null then
      select * into v_business from business_accounts where id = p_business_account_id;
    else
      select ba.* into v_business
      from business_account_members m
      join business_accounts ba on ba.id = m.business_account_id
      where m.profile_id = p_customer_id
      order by ba.active desc, m.added_at asc
      limit 1;
    end if;
  end if;

  if v_business.id is not null then
    return jsonb_strip_nulls(jsonb_build_object(
      'name', v_business.company_name,
      'contactPerson', nullif(v_business.contact_person, ''),
      'email', nullif(v_business.contact_email, ''),
      'phone', nullif(v_business.contact_phone, ''),
      'address', nullif(v_business.billing_info ->> 'address', ''),
      'city', nullif(v_business.billing_info ->> 'city', ''),
      'country', nullif(v_business.billing_info ->> 'country', ''),
      'trn', nullif(v_business.billing_info ->> 'trn', ''),
      'registrationNumber', nullif(v_business.billing_info ->> 'registration_number', ''),
      'licenseNumber', nullif(v_business.billing_info ->> 'license_number', ''),
      'accountHolder', v_profile.full_name
    ));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'name', v_profile.full_name,
    'email', nullif(v_profile.email, ''),
    'phone', nullif(v_profile.phone, '')
  ));
end;
$$;

-- One shipment -> one invoice. Returns the invoice number; calling it again
-- returns the same invoice (it is never issued twice).
create function issue_shipment_invoice(p_shipment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ship shipments%rowtype;
  v_account account_type;
  v_merchant boolean;
  v_existing text;
  v_invoice_id uuid := gen_random_uuid();
  v_number text;
  v_additional numeric(10, 2);
  v_service numeric(10, 2);
begin
  select * into v_ship from shipments where id = p_shipment_id;
  -- Someone who may not bill this shipment learns nothing about it.
  if not found or not invoice_caller_may_issue(v_ship.customer_id, v_ship.business_account_id) then
    raise exception 'Shipment not found';
  end if;

  -- Two clicks at once still produce one invoice.
  perform pg_advisory_xact_lock(hashtextextended('invoice:shipment:' || p_shipment_id::text, 0));

  select invoice_number into v_existing from invoices where shipment_id = p_shipment_id and status = 'issued';
  if v_existing is not null then
    return v_existing;
  end if;

  if v_ship.status = 'cancelled' then
    raise exception 'A cancelled shipment cannot be invoiced';
  end if;

  select account_type into v_account from profiles where id = v_ship.customer_id;
  v_merchant := v_account = 'merchant';

  if v_merchant and v_ship.batch_id is not null then
    raise exception 'This shipment is billed on its bulk shipment invoice';
  end if;

  -- The stored price is the amount billed. Weight and COD handling are the
  -- additional charges; the rest of the price is the delivery service.
  v_additional := coalesce(v_ship.weight_charge, 0) + coalesce(v_ship.cod_charge, 0);
  v_service := v_ship.price - v_additional;
  if v_service < 0 then
    raise exception 'This shipment''s charges are inconsistent and cannot be invoiced';
  end if;

  v_number := next_invoice_number();

  insert into invoices (
    id, invoice_number, invoice_type, customer_id, business_account_id, shipment_id,
    billed_to, reference, shipment_count, subtotal, additional_charges, discount_total, total, currency, issued_by
  ) values (
    v_invoice_id, v_number,
    case when v_merchant then 'merchant_shipment' else 'individual_shipment' end,
    v_ship.customer_id, v_ship.business_account_id, v_ship.id,
    invoice_billed_to(v_ship.customer_id, v_ship.business_account_id, v_merchant),
    v_ship.tracking_number, 1, v_service, v_additional, 0, v_ship.price, v_ship.currency, auth.uid()
  );

  insert into invoice_line_items (
    invoice_id, line_number, shipment_id, tracking_number, booked_at, pickup_address, dropoff_address,
    recipient_name, delivery_type, package_type, description, quantity, weight_kg, distance_km, payment_method,
    base_charge, distance_charge, service_charge, weight_charge, cod_charge, amount, currency
  ) values (
    v_invoice_id, 1, v_ship.id, v_ship.tracking_number, v_ship.created_at, v_ship.pickup_address, v_ship.dropoff_address,
    v_ship.dropoff_contact_name, v_ship.delivery_type, v_ship.package_type, v_ship.package_description,
    v_ship.package_quantity, v_ship.package_weight_kg, v_ship.distance_km, v_ship.payment_method,
    v_ship.base_charge, v_ship.distance_charge, v_service,
    coalesce(v_ship.weight_charge, 0), coalesce(v_ship.cod_charge, 0), v_ship.price, v_ship.currency
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (auth.uid(), 'invoice.issued', 'invoice', v_invoice_id,
    jsonb_build_object('invoiceNumber', v_number, 'shipmentId', v_ship.id, 'total', v_ship.price, 'currency', v_ship.currency));

  return v_number;
end;
$$;

-- One merchant batch -> one invoice covering every shipment in it that
-- wasn't cancelled. All lines are written by one INSERT ... SELECT.
create function issue_batch_invoice(p_batch_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch shipment_batches%rowtype;
  v_account account_type;
  v_existing text;
  v_invoice_id uuid := gen_random_uuid();
  v_number text;
  v_count integer;
  v_subtotal numeric(12, 2);
  v_additional numeric(12, 2);
  v_total numeric(12, 2);
  v_currencies integer;
  v_currency text;
  v_pickups integer;
  v_pickup text;
  v_lines_total numeric(12, 2);
begin
  select * into v_batch from shipment_batches where id = p_batch_id;
  if not found or not invoice_caller_may_issue(v_batch.customer_id, v_batch.business_account_id) then
    raise exception 'Bulk shipment not found';
  end if;

  select account_type into v_account from profiles where id = v_batch.customer_id;
  if v_account <> 'merchant' then
    raise exception 'Bulk invoices are for merchant accounts';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('invoice:batch:' || p_batch_id::text, 0));

  select invoice_number into v_existing from invoices where batch_id = p_batch_id and status = 'issued';
  if v_existing is not null then
    return v_existing;
  end if;

  if v_batch.status not in ('submitted', 'partially_failed', 'failed') then
    raise exception 'This bulk shipment has not been booked yet';
  end if;

  -- Hold the batch's shipments still until the invoice is written, so the
  -- totals and the lines are taken from exactly the same rows.
  perform 1 from shipments where batch_id = p_batch_id for share;

  select
    count(*)::integer,
    coalesce(sum(price - coalesce(weight_charge, 0) - coalesce(cod_charge, 0)), 0),
    coalesce(sum(coalesce(weight_charge, 0) + coalesce(cod_charge, 0)), 0),
    coalesce(sum(price), 0),
    count(distinct currency)::integer,
    min(currency),
    count(distinct pickup_address)::integer,
    min(pickup_address)
  into v_count, v_subtotal, v_additional, v_total, v_currencies, v_currency, v_pickups, v_pickup
  from shipments
  where batch_id = p_batch_id and status <> 'cancelled';

  if v_count = 0 then
    raise exception 'This bulk shipment has no shipments to invoice';
  end if;
  if v_currencies > 1 then
    raise exception 'This bulk shipment mixes currencies and cannot be invoiced';
  end if;
  if v_subtotal < 0 or exists (
    select 1 from shipments
    where batch_id = p_batch_id and status <> 'cancelled'
      and price < coalesce(weight_charge, 0) + coalesce(cod_charge, 0)
  ) then
    raise exception 'This shipment''s charges are inconsistent and cannot be invoiced';
  end if;

  v_number := next_invoice_number();

  insert into invoices (
    id, invoice_number, invoice_type, customer_id, business_account_id, batch_id,
    billed_to, reference, batch_name, pickup_address, shipment_count,
    subtotal, additional_charges, discount_total, total, currency, issued_by
  ) values (
    v_invoice_id, v_number, 'bulk_shipment', v_batch.customer_id, v_batch.business_account_id, v_batch.id,
    invoice_billed_to(v_batch.customer_id, v_batch.business_account_id, true),
    v_batch.reference, v_batch.name,
    -- The batch's own pickup (merchant uploads), else the one every shipment shares.
    coalesce(v_batch.pickup_address, case when v_pickups = 1 then v_pickup end),
    v_count, v_subtotal, v_additional, 0, v_total, v_currency, auth.uid()
  );

  insert into invoice_line_items (
    invoice_id, line_number, shipment_id, tracking_number, booked_at, pickup_address, dropoff_address,
    recipient_name, delivery_type, package_type, description, quantity, weight_kg, distance_km, payment_method,
    base_charge, distance_charge, service_charge, weight_charge, cod_charge, amount, currency
  )
  select
    v_invoice_id,
    row_number() over (order by s.created_at, s.id),
    s.id, s.tracking_number, s.created_at, s.pickup_address, s.dropoff_address,
    s.dropoff_contact_name, s.delivery_type, s.package_type, s.package_description,
    s.package_quantity, s.package_weight_kg, s.distance_km, s.payment_method,
    s.base_charge, s.distance_charge,
    s.price - coalesce(s.weight_charge, 0) - coalesce(s.cod_charge, 0),
    coalesce(s.weight_charge, 0), coalesce(s.cod_charge, 0), s.price, s.currency
  from shipments s
  where s.batch_id = p_batch_id and s.status <> 'cancelled';

  -- Belt and braces: the header must equal its lines.
  select coalesce(sum(amount), 0) into v_lines_total from invoice_line_items where invoice_id = v_invoice_id;
  if v_lines_total <> v_total then
    raise exception 'Invoice total does not match its lines';
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (auth.uid(), 'invoice.issued', 'invoice', v_invoice_id,
    jsonb_build_object('invoiceNumber', v_number, 'batchId', v_batch.id, 'shipments', v_count, 'total', v_total, 'currency', v_currency));

  return v_number;
end;
$$;

-- Only the two entry points are callable; the helpers run inside them.
-- Revoked explicitly: 0018's schema-level ALTER DEFAULT PRIVILEGES can't
-- remove Postgres's built-in EXECUTE-to-PUBLIC default (as 0024 does for
-- anonymize_profile).
revoke execute on function next_invoice_number() from public, anon, authenticated;
revoke execute on function invoice_caller_may_issue(uuid, uuid) from public, anon, authenticated;
revoke execute on function invoice_billed_to(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function issue_shipment_invoice(uuid) from public, anon;
revoke execute on function issue_batch_invoice(uuid) from public, anon;
grant execute on function issue_shipment_invoice(uuid) to authenticated;
grant execute on function issue_batch_invoice(uuid) to authenticated;
