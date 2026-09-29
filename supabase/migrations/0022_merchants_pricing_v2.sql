-- ParcelLink v2: merchant accounts, delivery types, weight/COD pricing, the
-- distance limit, product cash-on-delivery, and short tracking codes.
--
-- 1. Account types. profiles.account_type is 'individual' or 'merchant'.
--    Only review_merchant_application() (a manager decision) can change it;
--    no client session can, not even a manager's.
-- 2. merchant_applications: one application per customer, reviewed by a
--    manager. Approval creates (or re-activates) a business_accounts row
--    for the merchant, so their shipments show up in the manager's
--    existing business-account pages and CSV upload.
-- 3. Pricing rules gain delivery_type, account_type, a weight allowance,
--    a COD handling fee and a maximum distance. One active rule per
--    (delivery_type, account_type). Merchant "flat rate" rules are rules
--    with additional_price_per_km = 0.
-- 4. Shipments store the delivery type, the recipient payment status
--    (prepaid / postpaid), the amount to collect from the recipient, and a
--    price breakdown. The database re-checks every component of the price
--    for client-created bookings, and refuses any booking beyond the
--    rule's maximum distance for every caller, staff included.
-- 5. cod_transactions are created by a trigger when a driver is assigned.
--    Previously the app inserted them without driver_id (a NOT NULL
--    column), so the insert always failed and no COD record ever existed.
-- 6. tracking_number becomes an 8-character code. The previous value is
--    kept in legacy_tracking_number and still works on /tracking.

-- ── Enums ────────────────────────────────────────────────────────────────
create type account_type as enum ('individual', 'merchant');

-- New review states can be added later with ALTER TYPE ... ADD VALUE; the
-- review function and app treat anything other than 'approved' as "no
-- merchant access".
create type merchant_status as enum ('pending', 'approved', 'rejected', 'requires_changes');

create type delivery_type as enum ('same_day', 'next_day');

create type recipient_payment_type as enum ('prepaid', 'postpaid');

-- ── 1. Profiles ──────────────────────────────────────────────────────────
alter table profiles
  add column account_type account_type not null default 'individual',
  -- null = the customer hasn't answered "How will you use ParcelLink?" yet.
  add column account_type_selected_at timestamptz;

-- Everyone who registered before this existed has effectively chosen
-- "individual"; they can still apply to become a merchant later.
update profiles set account_type_selected_at = created_at;

create function current_account_type()
returns account_type
language sql
stable
security definer
set search_path = public
as $$
  select account_type from profiles where id = auth.uid();
$$;

-- Used inside RLS policies, so both roles need to be able to call it
-- (0018 made new functions un-callable by default).
grant execute on function current_account_type() to anon, authenticated;

create or replace function prevent_profile_privilege_escalation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trusted callers (service-role client, SECURITY DEFINER functions,
  -- migrations) aren't restricted here — that's how staff onboarding and
  -- merchant approval operate.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.role is distinct from old.role and ('manager' in (new.role, old.role)) then
    raise exception 'The manager role cannot be granted or revoked from the application';
  end if;

  -- Merchant status is granted only by review_merchant_application().
  if new.account_type is distinct from old.account_type then
    raise exception 'Account type can only change through merchant approval';
  end if;

  if not is_manager() then
    if new.role is distinct from old.role then
      raise exception 'Only a manager can change a profile''s role';
    end if;
    if new.active is distinct from old.active then
      raise exception 'Only a manager can activate or deactivate a profile';
    end if;
  end if;

  return new;
end;
$$;

-- ── 2. Merchant applications ─────────────────────────────────────────────
create table merchant_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles (id) on delete cascade,
  status merchant_status not null default 'pending',

  company_name text not null check (char_length(company_name) between 2 and 160),
  registration_number text not null check (char_length(registration_number) between 2 and 60),
  license_number text not null check (char_length(license_number) between 2 and 60),
  company_address text not null check (char_length(company_address) between 5 and 300),
  country text not null check (char_length(country) between 2 and 60),
  city text not null check (char_length(city) between 2 and 80),
  company_phone text not null check (char_length(company_phone) between 7 and 25),
  business_email text not null check (char_length(business_email) between 5 and 160),
  website text check (website is null or char_length(website) <= 200),

  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_position text not null check (char_length(contact_position) between 2 and 80),
  contact_phone text not null check (char_length(contact_phone) between 7 and 25),
  contact_email text not null check (char_length(contact_email) between 5 and 160),

  business_category text not null check (char_length(business_category) between 2 and 60),
  monthly_shipment_volume text not null check (char_length(monthly_shipment_volume) between 1 and 30),
  pickup_address text not null check (char_length(pickup_address) between 5 and 300),
  needs_cod boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 1000),
  -- Trade licence upload, in the applicant's own folder of the
  -- merchant-documents bucket (policies below).
  trade_license_path text check (trade_license_path is null or trade_license_path like profile_id::text || '/%'),

  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  business_account_id uuid references business_accounts (id),

  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index merchant_applications_status_idx on merchant_applications (status, submitted_at desc);

create trigger merchant_applications_set_updated_at
  before update on merchant_applications
  for each row execute function set_updated_at();

alter table merchant_applications enable row level security;

-- Company details are visible to the applicant and to managers only —
-- operators and drivers have no reason to see them.
create policy merchant_applications_select on merchant_applications
  for select
  using (profile_id = (select auth.uid()) or (select is_manager()));

-- A customer may submit one application for themselves, only in its
-- initial state. Staff accounts can't become merchants.
create policy merchant_applications_insert on merchant_applications
  for insert
  with check (
    profile_id = (select auth.uid())
    and (select current_app_role()) = 'customer'
    and status = 'pending'
    and review_note is null
    and reviewed_by is null
    and reviewed_at is null
    and business_account_id is null
  );

-- The applicant may edit and resubmit after a manager asked for changes
-- or rejected it (column rules in the trigger below). Managers decide
-- through review_merchant_application(), never a direct update.
create policy merchant_applications_update on merchant_applications
  for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create function enforce_merchant_application_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if old.status not in ('requires_changes', 'rejected') then
    raise exception 'This application can''t be edited while it is %', old.status;
  end if;
  if new.status <> 'pending' then
    raise exception 'An edited application must be resubmitted for review';
  end if;
  if new.profile_id is distinct from old.profile_id
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.review_note is distinct from old.review_note
    or new.business_account_id is distinct from old.business_account_id
  then
    raise exception 'Review fields can only be changed by a manager';
  end if;

  new.submitted_at := now();
  return new;
end;
$$;

create trigger merchant_applications_enforce_update
  before update on merchant_applications
  for each row execute function enforce_merchant_application_update();

-- Supporting documents: private, folder-scoped by uploader like
-- package-images, readable by the applicant and managers only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-documents', 'merchant-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy merchant_documents_insert on storage.objects
  for insert
  with check (
    bucket_id = 'merchant-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy merchant_documents_select on storage.objects
  for select
  using (
    bucket_id = 'merchant-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_manager())
  );

-- The only way an application is approved, rejected or sent back — and
-- the only way profiles.account_type ever changes.
create function review_merchant_application(p_application_id uuid, p_decision merchant_status, p_note text default null)
returns merchant_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app merchant_applications%rowtype;
  v_business_id uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not is_manager() then
    raise exception 'Only a manager can review merchant applications';
  end if;
  if p_decision = 'pending' then
    raise exception 'Choose approve, reject or request changes';
  end if;
  if p_decision in ('rejected', 'requires_changes') and v_note is null then
    raise exception 'Give the applicant a reason';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Keep the message under 1000 characters';
  end if;

  select * into v_app from merchant_applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found';
  end if;

  if p_decision = 'approved' then
    v_business_id := v_app.business_account_id;

    if v_business_id is null then
      insert into business_accounts (company_name, contact_person, contact_email, contact_phone, billing_info, created_by)
      values (
        v_app.company_name,
        v_app.contact_name,
        v_app.business_email,
        v_app.company_phone,
        jsonb_build_object(
          'address', v_app.company_address,
          'city', v_app.city,
          'country', v_app.country,
          'registration_number', v_app.registration_number,
          'license_number', v_app.license_number,
          'website', coalesce(v_app.website, '')
        ),
        auth.uid()
      )
      returning id into v_business_id;
    else
      update business_accounts
      set active = true, company_name = v_app.company_name, contact_person = v_app.contact_name,
          contact_email = v_app.business_email, contact_phone = v_app.company_phone
      where id = v_business_id;
    end if;

    insert into business_account_members (business_account_id, profile_id)
    values (v_business_id, v_app.profile_id)
    on conflict do nothing;

    update profiles set account_type = 'merchant', account_type_selected_at = coalesce(account_type_selected_at, now())
    where id = v_app.profile_id;
  else
    -- Rejecting or sending back an approved merchant revokes access.
    update profiles set account_type = 'individual' where id = v_app.profile_id;
    if v_app.business_account_id is not null then
      update business_accounts set active = false where id = v_app.business_account_id;
    end if;
    v_business_id := v_app.business_account_id;
  end if;

  update merchant_applications
  set status = p_decision,
      review_note = v_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      business_account_id = v_business_id
  where id = p_application_id;

  return p_decision;
end;
$$;

grant execute on function review_merchant_application(uuid, merchant_status, text) to authenticated;

-- In-app notifications, from the one place that sees every status change.
create function notify_merchant_application_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or (new.status = 'pending' and old.status is distinct from 'pending') then
    insert into notifications (profile_id, type, title, body, data)
    select id, 'merchant.application_submitted', 'New merchant application',
      new.company_name || ' applied for a merchant account.',
      jsonb_build_object('applicationId', new.id)
    from profiles
    where role = 'manager' and active;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' then
      insert into notifications (profile_id, type, title, body, data)
      values (
        new.profile_id, 'merchant.approved', 'Your ParcelLink Merchant account has been approved',
        'You now have merchant pricing and tools. Book your first merchant shipment from your dashboard.',
        jsonb_build_object('applicationId', new.id)
      );
    elsif new.status in ('rejected', 'requires_changes') then
      insert into notifications (profile_id, type, title, body, data)
      values (
        new.profile_id, 'merchant.' || new.status::text, 'Your Merchant application requires attention',
        coalesce(new.review_note, '') ||
          case when new.status = 'requires_changes'
            then ' Update your application and resubmit it from the Merchant page.'
            else ' You can edit and resubmit your application from the Merchant page.'
          end,
        jsonb_build_object('applicationId', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger merchant_applications_notify
  after insert or update on merchant_applications
  for each row execute function notify_merchant_application_change();

-- ── 3. Pricing rules ─────────────────────────────────────────────────────
alter table pricing_rules
  add column delivery_type delivery_type not null default 'same_day',
  add column account_type account_type not null default 'individual',
  add column included_weight_kg numeric(8, 2) not null default 20 check (included_weight_kg >= 0),
  add column additional_price_per_kg numeric(10, 2) not null default 1 check (additional_price_per_kg >= 0),
  add column cod_fee numeric(10, 2) not null default 0 check (cod_fee >= 0),
  add column max_distance_km numeric(7, 2) not null default 50 check (max_distance_km > 0);

-- One active rule per service and account type (was: one active rule).
create or replace function enforce_single_active_pricing_rule()
returns trigger
language plpgsql
as $$
begin
  if new.is_active then
    update pricing_rules
    set is_active = false
    where id <> new.id
      and is_active
      and delivery_type = new.delivery_type
      and account_type = new.account_type;
  end if;
  return new;
end;
$$;

create unique index pricing_rules_one_active_idx on pricing_rules (delivery_type, account_type) where is_active;

-- Next-day: AED 8 for the first 5 km, AED 0.75 per km after that.
insert into pricing_rules (name, delivery_type, account_type, base_distance_km, base_price, additional_price_per_km, is_active)
select 'Next-Day Standard', 'next_day', 'individual', 5, 8, 0.75, true
where not exists (select 1 from pricing_rules where delivery_type = 'next_day' and account_type = 'individual');

-- Merchant flat rates: one price for any distance up to the limit. These
-- are starting values — a manager sets the real rates on the Pricing page.
insert into pricing_rules (name, delivery_type, account_type, base_distance_km, base_price, additional_price_per_km, is_active)
select 'Merchant Same-Day Flat', 'same_day', 'merchant', 50, 15, 0, true
where not exists (select 1 from pricing_rules where delivery_type = 'same_day' and account_type = 'merchant');

insert into pricing_rules (name, delivery_type, account_type, base_distance_km, base_price, additional_price_per_km, is_active)
select 'Merchant Next-Day Flat', 'next_day', 'merchant', 50, 10, 0, true
where not exists (select 1 from pricing_rules where delivery_type = 'next_day' and account_type = 'merchant');

-- Individual rates are public (landing page, anonymous quotes). Merchant
-- rates are only visible to merchants and staff.
drop policy pricing_rules_select_active on pricing_rules;
create policy pricing_rules_select_active on pricing_rules
  for select
  using (
    (is_active and (account_type = 'individual' or (select current_account_type()) = 'merchant'))
    or (select is_staff())
  );

-- ── 4. Shipments ─────────────────────────────────────────────────────────
alter table shipments
  add column delivery_type delivery_type not null default 'same_day',
  add column recipient_payment_type recipient_payment_type not null default 'prepaid',
  -- What the driver collects from the recipient for the goods — separate
  -- from the delivery fee (price) and the declared product value.
  add column cod_amount numeric(10, 2) not null default 0,
  add column product_value numeric(10, 2),
  add column package_length_cm numeric(7, 1),
  add column package_width_cm numeric(7, 1),
  add column package_height_cm numeric(7, 1),
  -- Price breakdown (null on shipments booked before this migration).
  add column base_charge numeric(10, 2),
  add column distance_charge numeric(10, 2),
  add column weight_charge numeric(10, 2),
  add column cod_charge numeric(10, 2),
  add column legacy_tracking_number text unique;

alter table shipments
  add constraint shipments_cod_amount_check check (
    cod_amount <= 100000
    and (
      (recipient_payment_type = 'prepaid' and cod_amount = 0)
      or (recipient_payment_type = 'postpaid' and cod_amount > 0)
    )
  ),
  add constraint shipments_product_value_check check (product_value is null or (product_value >= 0 and product_value <= 1000000)),
  add constraint shipments_dimensions_check check (
    (package_length_cm is null or (package_length_cm > 0 and package_length_cm <= 1000))
    and (package_width_cm is null or (package_width_cm > 0 and package_width_cm <= 1000))
    and (package_height_cm is null or (package_height_cm > 0 and package_height_cm <= 1000))
  ),
  add constraint shipments_weight_check check (package_weight_kg is null or (package_weight_kg >= 0 and package_weight_kg <= 1000)) not valid;

create index shipments_delivery_type_idx on shipments (delivery_type);

-- Re-derives every component of the price from the stored inputs and the
-- ACTIVE rule for this service and the customer's account type. Rounding
-- matches lib/pricing/calculate.ts: each component is rounded to fils.
drop policy shipments_insert on shipments;
drop function shipment_price_is_valid(numeric, uuid, numeric, text);

create function shipment_price_is_valid(
  p_customer_id uuid,
  p_pricing_rule_id uuid,
  p_delivery_type delivery_type,
  p_distance_km numeric,
  p_weight_kg numeric,
  p_recipient_payment_type recipient_payment_type,
  p_base_charge numeric,
  p_distance_charge numeric,
  p_weight_charge numeric,
  p_cod_charge numeric,
  p_price numeric,
  p_currency text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rule pricing_rules%rowtype;
  v_account account_type;
  v_distance numeric(10, 2);
  v_weight numeric(10, 2);
  v_cod numeric(10, 2);
begin
  select account_type into v_account from profiles where id = p_customer_id;
  if not found then
    return false;
  end if;

  select * into rule
  from pricing_rules
  where id = p_pricing_rule_id and is_active and delivery_type = p_delivery_type and account_type = v_account;
  if not found then
    return false;
  end if;

  if p_distance_km > rule.max_distance_km then
    return false;
  end if;
  -- Merchant pricing depends on weight, so it's compulsory there.
  if v_account = 'merchant' and p_weight_kg is null then
    return false;
  end if;

  v_distance := round(greatest(p_distance_km - rule.base_distance_km, 0) * rule.additional_price_per_km, 2);
  v_weight := round(greatest(coalesce(p_weight_kg, 0) - rule.included_weight_kg, 0) * rule.additional_price_per_kg, 2);
  v_cod := case when p_recipient_payment_type = 'postpaid' then rule.cod_fee else 0 end;

  return rule.currency = p_currency
    and round(p_base_charge, 2) = rule.base_price
    and round(p_distance_charge, 2) = v_distance
    and round(p_weight_charge, 2) = v_weight
    and round(p_cod_charge, 2) = v_cod
    and round(p_price, 2) = rule.base_price + v_distance + v_weight + v_cod;
end;
$$;

grant execute on function shipment_price_is_valid(uuid, uuid, delivery_type, numeric, numeric, recipient_payment_type, numeric, numeric, numeric, numeric, numeric, text)
  to authenticated;

create policy shipments_insert on shipments
  for insert
  with check (
    (customer_id = (select auth.uid()) or (select is_staff()))
    and (
      (select is_staff())
      or shipment_price_is_valid(
        customer_id, pricing_rule_id, delivery_type, distance_km, package_weight_kg, recipient_payment_type,
        base_charge, distance_charge, weight_charge, cod_charge, price, currency
      )
    )
  );

-- The distance limit applies to every booking path — customer, staff on a
-- customer's behalf, bulk upload — not only the ones the price check
-- covers (staff are exempt from that).
create function enforce_shipment_distance_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max numeric;
begin
  if new.pricing_rule_id is not null then
    select max_distance_km into v_max from pricing_rules where id = new.pricing_rule_id;
  else
    select max(max_distance_km) into v_max from pricing_rules where is_active and delivery_type = new.delivery_type;
  end if;

  if v_max is not null and new.distance_km > v_max then
    raise exception 'This delivery is % km, beyond the % km ParcelLink delivery limit', new.distance_km, v_max;
  end if;
  return new;
end;
$$;

create trigger shipments_enforce_distance_limit
  before insert on shipments
  for each row execute function enforce_shipment_distance_limit();

-- ── 5. Short tracking codes ──────────────────────────────────────────────
-- 8 characters from a 31-symbol alphabet (no 0/O/1/I/L, so nothing is
-- misread on a label or over the phone): ~8.5e11 codes. Combined with the
-- tracking lookup's rate limit and Turnstile, guessing them isn't practical.
create function generate_short_tracking_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea;
  code text;
begin
  loop
    bytes := gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (
      select 1 from shipments where tracking_number = code or legacy_tracking_number = code
    );
  end loop;
  return code;
end;
$$;

do $$
declare
  r record;
begin
  for r in select id from shipments loop
    update shipments
    set legacy_tracking_number = tracking_number,
        tracking_number = generate_short_tracking_code()
    where id = r.id;
  end loop;
end;
$$;

alter table shipments
  alter column tracking_number drop default,
  add constraint shipments_tracking_code_format check (tracking_number ~ '^[2-9A-HJKMNP-Z]{8}$');

-- Always server-generated — a client can't pick its own code — and never
-- changed afterwards (it's printed on labels).
create function assign_shipment_tracking_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.tracking_number := generate_short_tracking_code();
    new.legacy_tracking_number := null;
  elsif new.tracking_number is distinct from old.tracking_number
    or new.legacy_tracking_number is distinct from old.legacy_tracking_number then
    raise exception 'Tracking codes cannot be changed';
  end if;
  return new;
end;
$$;

create trigger shipments_assign_tracking_code
  before insert or update on shipments
  for each row execute function assign_shipment_tracking_code();

-- Public lookup accepts the new code or an old DLV-... number, in any
-- case and with stray spaces. It returns the new code.
create or replace function get_shipment_tracking(p_tracking_number text)
returns public_tracking_result
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result public_tracking_result;
  s shipments%rowtype;
  loc driver_locations%rowtype;
  v_code text := upper(regexp_replace(coalesce(p_tracking_number, ''), '\s', '', 'g'));
begin
  select * into s from shipments where tracking_number = v_code or legacy_tracking_number = v_code;
  if not found then
    return null;
  end if;

  result.tracking_number := s.tracking_number;
  result.status := s.status;
  result.created_at := s.created_at;
  result.distance_km := s.distance_km;
  result.estimated_duration_minutes := s.duration_minutes;

  if s.status in ('driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination') then
    select * into loc from driver_locations
    where shipment_id = s.id
    order by recorded_at desc
    limit 1;

    if found then
      result.driver_lat := loc.lat;
      result.driver_lng := loc.lng;
      result.driver_location_updated_at := loc.recorded_at;
    end if;
  end if;

  return result;
end;
$$;

create or replace function get_shipment_tracking_history(p_tracking_number text)
returns table (status shipment_status, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.status, h.created_at
  from shipment_status_history h
  join shipments s on s.id = h.shipment_id
  where s.tracking_number = upper(regexp_replace(coalesce(p_tracking_number, ''), '\s', '', 'g'))
     or s.legacy_tracking_number = upper(regexp_replace(coalesce(p_tracking_number, ''), '\s', '', 'g'))
  order by h.created_at;
$$;

-- ── 6. Cash on delivery ──────────────────────────────────────────────────
-- What the driver hands over is split so the goods money (owed to the
-- merchant/sender) never gets mixed up with ParcelLink's delivery fee.
alter table cod_transactions
  add column product_amount numeric(10, 2) not null default 0 check (product_amount >= 0),
  add column delivery_fee_amount numeric(10, 2) not null default 0 check (delivery_fee_amount >= 0);

update cod_transactions set delivery_fee_amount = amount where product_amount = 0 and delivery_fee_amount = 0;

-- SECURITY INVOKER (the 0007 original was DEFINER): current_user must be
-- the caller's, so that the COD sync trigger below — trusted code — can
-- move an expected record to a newly assigned driver.
create or replace function prevent_cod_tampering()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not is_staff() then
    if new.status not in ('collected')
      or old.status <> 'expected'
      or new.reconciled_by is distinct from old.reconciled_by
      or new.reconciled_at is distinct from old.reconciled_at
      or new.amount is distinct from old.amount
      or new.product_amount is distinct from old.product_amount
      or new.delivery_fee_amount is distinct from old.delivery_fee_amount
      or new.driver_id is distinct from old.driver_id
      or new.shipment_id is distinct from old.shipment_id
    then
      raise exception 'A driver may only mark their own expected COD as collected';
    end if;
  end if;
  return new;
end;
$$;

-- The expected-collection record needs a driver, so it's created (or moved
-- to the new driver) when one is assigned, and dropped if the shipment is
-- cancelled before anything was collected.
create function sync_shipment_cod_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product numeric(10, 2) := case when new.recipient_payment_type = 'postpaid' then new.cod_amount else 0 end;
  v_fee numeric(10, 2) := case when new.payment_method = 'cod' then new.price else 0 end;
begin
  if v_product + v_fee = 0 then
    return new;
  end if;

  if new.status in ('cancelled', 'returned') then
    delete from cod_transactions where shipment_id = new.id and status = 'expected';
    return new;
  end if;

  if new.driver_id is null then
    return new;
  end if;

  if exists (select 1 from cod_transactions where shipment_id = new.id and status = 'expected') then
    update cod_transactions set driver_id = new.driver_id
    where shipment_id = new.id and status = 'expected' and driver_id is distinct from new.driver_id;
  elsif not exists (select 1 from cod_transactions where shipment_id = new.id) then
    insert into cod_transactions (shipment_id, driver_id, customer_id, amount, product_amount, delivery_fee_amount, status)
    values (new.id, new.driver_id, new.customer_id, v_product + v_fee, v_product, v_fee, 'expected');
  end if;

  return new;
end;
$$;

create trigger shipments_sync_cod_transaction
  after insert or update of driver_id, status on shipments
  for each row execute function sync_shipment_cod_transaction();

-- Existing COD shipments that already have a driver get their record now.
insert into cod_transactions (shipment_id, driver_id, customer_id, amount, product_amount, delivery_fee_amount, status)
select s.id, s.driver_id, s.customer_id, s.price, 0, s.price, 'expected'
from shipments s
where s.payment_method = 'cod'
  and s.driver_id is not null
  and s.status not in ('cancelled', 'returned', 'delivered')
  and not exists (select 1 from cod_transactions c where c.shipment_id = s.id);

-- ── 7. Multi-shipment bookings share the batch pipeline ──────────────────
-- A customer booking several shipments at once gets one batch, so the
-- batch notification is worded for both that and a staff bulk upload.
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
  if old.status <> 'processing' or new.status = 'processing' then
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
