-- Operators book shipments for customers who have no ParcelLink account
-- (WhatsApp, telephone and walk-in orders).
--
-- A profile is one auth.users row (0002), so an unregistered customer can't
-- have one without a fake sign-in, and a shared "walk-in" profile would mix
-- unrelated customers' histories. Instead the shipment itself carries the
-- customer's contact details and has no customer_id:
--
--   customer_id           null for a guest booking (still required for
--                         every other booking, by the CHECK below).
--   guest_customer_name   who asked for the delivery, as they gave it.
--   guest_customer_phone  how to reach them.
--   booked_by             the staff member who entered it (any booking from
--                         now on records who entered it).
--
-- Guest details are never matched or merged with registered customers by
-- phone number: each guest booking stands alone.
--
-- Who can create one: shipments_insert already only lets a session insert a
-- shipment for itself or, for staff, for anyone — a null customer_id fails
-- `customer_id = auth.uid()`, so only staff can insert a guest booking. The
-- policy is recreated below only to add "booked_by is you".
--
-- Pricing: a guest is priced as an individual. Staff inserts are exempt from
-- shipment_price_is_valid() (0022) as before — the server prices every
-- booking — but the distance limit applies to every caller, and now takes
-- the individual limit when there is no customer.
--
-- Everything that reads customer_id is adjusted to cope with null:
--   * notifications whose recipient would be the (absent) customer are
--     skipped by one BEFORE INSERT trigger, instead of failing the booking
--     or each status change;
--   * issue_delivery_otp() refuses: the code is delivered to the customer's
--     in-app feed, which a guest doesn't have (the delivery photo, which is
--     always required, remains the proof);
--   * staff_shipment_feed and search_staff_shipments() list guest bookings
--     under Individual, and the search matches the guest's name and phone;
--   * cod_transactions.customer_id is nullable (the COD record is created
--     from the shipment when a driver is assigned).
-- Guest bookings can't join a batch (a batch belongs to one customer), and
-- have their own duplicate-submission index: the 0019 index is per
-- customer, and nulls never collide in a unique index.

-- ── 1. Columns ───────────────────────────────────────────────────────────
alter table shipments
  alter column customer_id drop not null,
  add column booked_by uuid references profiles (id),
  add column guest_customer_name text,
  add column guest_customer_phone text;

alter table shipments
  add constraint shipments_customer_or_guest_check check (
    case
      when customer_id is not null then guest_customer_name is null and guest_customer_phone is null
      else booked_by is not null
        and batch_id is null
        and length(btrim(coalesce(guest_customer_name, ''))) between 1 and 120
        and length(btrim(coalesce(guest_customer_phone, ''))) between 5 and 30
    end
  );

create index shipments_booked_by_idx on shipments (booked_by) where booked_by is not null;

-- One guest shipment per (staff member, booking attempt).
create unique index shipments_guest_request_unique
  on shipments (booked_by, client_request_id)
  where customer_id is null and client_request_id is not null;

alter table cod_transactions alter column customer_id drop not null;

-- ── 2. Insert policy ─────────────────────────────────────────────────────
-- Same as 0022 plus: booked_by, when given, is the signed-in user.
drop policy shipments_insert on shipments;

create policy shipments_insert on shipments
  for insert
  with check (
    (customer_id = (select auth.uid()) or (select is_staff()))
    and (booked_by is null or booked_by = (select auth.uid()))
    and (
      (select is_staff())
      or shipment_price_is_valid(
        customer_id, pricing_rule_id, delivery_type, distance_km, package_weight_kg, recipient_payment_type,
        base_charge, distance_charge, weight_charge, cod_charge, price, currency
      )
    )
  );

-- ── 3. Distance limit without a customer ─────────────────────────────────
-- As 0027; a booking with no customer takes the individual limit.
create or replace function enforce_shipment_distance_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max numeric;
  v_account account_type;
begin
  if new.pricing_rule_id is not null then
    select max_distance_km into v_max from pricing_rules where id = new.pricing_rule_id;
  else
    v_account := coalesce((select account_type from profiles where id = new.customer_id), 'individual');
    select r.max_distance_km into v_max
    from pricing_rules r
    where r.is_active and r.delivery_type = new.delivery_type and r.account_type = v_account;
  end if;

  if v_max is not null and new.distance_km > v_max then
    raise exception 'This delivery is % km, beyond the % km ParcelLink delivery limit', new.distance_km, v_max;
  end if;
  return new;
end;
$$;

-- ── 4. Notifications without a recipient ─────────────────────────────────
-- The shipment triggers (notify_shipment_created, notify_shipment_status_change)
-- address the customer as new.customer_id. For a guest booking that is null:
-- there is no feed to write to, so the row is dropped rather than failing
-- the booking or the driver's status update. BEFORE triggers run before the
-- NOT NULL check, so returning null here skips the insert.
create function skip_notification_without_recipient()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  return null;
end;
$$;

revoke execute on function skip_notification_without_recipient() from public, anon, authenticated;

create trigger notifications_skip_without_recipient
  before insert on notifications
  for each row
  when (new.profile_id is null)
  execute function skip_notification_without_recipient();

-- ── 5. Delivery OTP for a guest ──────────────────────────────────────────
-- As 0018, plus a clear refusal for a shipment with no customer account.
create or replace function issue_delivery_otp(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments%rowtype;
  v_code text;
begin
  select * into v_shipment from shipments where id = p_shipment_id;

  if not found or v_shipment.driver_id is distinct from auth.uid() then
    raise exception 'Not authorized for this shipment';
  end if;
  if v_shipment.status <> 'arrived_destination' then
    raise exception 'Arrive at the destination before requesting a code';
  end if;
  if v_shipment.customer_id is null then
    raise exception 'This customer has no ParcelLink account to receive a code. Use the delivery photo as proof.';
  end if;

  v_code := lpad(((get_byte(gen_random_bytes(2), 0) * 256 + get_byte(gen_random_bytes(2), 1)) % 10000)::text, 4, '0');

  -- Stored as a bcrypt hash: the plaintext only ever exists in the
  -- customer's notification below.
  update shipment_secrets
  set delivery_otp = crypt(v_code, gen_salt('bf', 8)), delivery_otp_attempts = 0
  where shipment_id = p_shipment_id;

  insert into notifications (profile_id, type, title, body)
  values (
    v_shipment.customer_id,
    'delivery.otp',
    'Delivery verification code',
    'Share this code with your driver to confirm delivery of ' || v_shipment.tracking_number || ': ' || v_code
  );
end;
$$;

-- ── 6. Staff shipment list ───────────────────────────────────────────────
-- As 0030; a guest booking has no profile, so it joins none and is listed
-- as an individual booking.
create or replace view staff_shipment_feed with (security_invoker = true) as
select
  'shipment'::text as kind,
  s.id,
  s.created_at,
  s.customer_id,
  coalesce(p.account_type, 'individual'::account_type) as account_type
from shipments s
left join profiles p on p.id = s.customer_id
where s.batch_id is null
union all
select
  'batch'::text as kind,
  b.id,
  b.created_at,
  b.customer_id,
  p.account_type
from shipment_batches b
join profiles p on p.id = b.customer_id
where b.status in ('processing', 'submitted', 'partially_failed', 'failed');

-- As 0038, with two additions: the text search also matches a guest
-- booking's customer name and phone, and the Individual tab includes guest
-- bookings (no customer profile).
create or replace function search_staff_shipments(
  p_query text default null,
  p_statuses shipment_status[] default null,
  p_from date default null,
  p_to date default null,
  p_account_type account_type default null,
  p_bulk_only boolean default false,
  p_batch_id uuid default null
)
returns setof shipments
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select
      nullif(btrim(regexp_replace(left(p_query, 100), '[\r\n]+', ' ', 'g')), '') as text,
      regexp_replace(coalesce(left(p_query, 100), ''), '\D', '', 'g') as digits
  ),
  params as (
    select
      term.text,
      case
        when term.text is null then null
        else '%' || replace(replace(replace(lower(term.text), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pattern,
      case
        when length(term.digits) < 3 then null
        when length(phone_search_key(term.digits)) >= 3 then '%' || phone_search_key(term.digits) || '%'
        else '%' || term.digits || '%'
      end as phone_pattern
    from term
  ),
  people as (
    select
      (select coalesce(array_agg(p.id), '{}') from profiles p
        where p.role = 'customer' and (p.full_name ilike params.pattern or p.email ilike params.pattern)) as customer_ids,
      (select coalesce(array_agg(p.id), '{}') from profiles p
        where p.role = 'driver' and p.full_name ilike params.pattern) as driver_ids,
      (select coalesce(array_agg(ba.id), '{}') from business_accounts ba
        where ba.company_name ilike params.pattern) as business_ids
    from params
    where params.pattern is not null
  )
  select s.*
  from shipments s
  cross join params
  left join people on true
  where (select is_staff())
    and (p_statuses is null or s.status = any (p_statuses))
    and (p_from is null or s.created_at >= (p_from::timestamp at time zone 'Asia/Dubai'))
    and (p_to is null or s.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Dubai'))
    and (p_batch_id is null or s.batch_id = p_batch_id)
    and (not coalesce(p_bulk_only, false) or s.batch_id is not null)
    and (
      p_account_type is null
      or exists (select 1 from profiles c where c.id = s.customer_id and c.account_type = p_account_type)
      or (s.customer_id is null and p_account_type = 'individual')
    )
    and (
      params.pattern is null
      or shipment_search_document(
           s.tracking_number, s.legacy_tracking_number, s.pickup_contact_name, s.dropoff_contact_name,
           s.pickup_address, s.dropoff_address, s.pickup_building, s.dropoff_building,
           s.pickup_contact_phone, s.dropoff_contact_phone
         ) like params.pattern
      or (
        params.phone_pattern is not null
        and shipment_search_document(
              s.tracking_number, s.legacy_tracking_number, s.pickup_contact_name, s.dropoff_contact_name,
              s.pickup_address, s.dropoff_address, s.pickup_building, s.dropoff_building,
              s.pickup_contact_phone, s.dropoff_contact_phone
            ) like params.phone_pattern
      )
      or s.customer_id = any (people.customer_ids)
      or s.driver_id = any (people.driver_ids)
      or s.business_account_id = any (people.business_ids)
      or lower(s.guest_customer_name) like params.pattern
      or (params.phone_pattern is not null and phone_search_key(s.guest_customer_phone) like params.phone_pattern)
    )
  order by s.created_at desc, s.id desc;
$$;
