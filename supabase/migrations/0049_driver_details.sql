-- Operator dashboard → Drivers → one driver: their shipments, what they
-- collected, and the cash they still hold. Read-only; nothing here writes.
--
-- ── Definitions ──────────────────────────────────────────────────────────
-- Assigned       shipments.driver_id = the driver. That column is the only
--                record of assignment: there is no assignment history
--                (shipment_status_history doesn't say which driver), so a
--                shipment reassigned to someone else leaves this driver's
--                list, and one reassigned back is still one shipment.
--                Each shipment is one row, so it's counted once.
-- Period         shipments by booking date (created_at, UAE days), as on
--                every other shipment list. Cash by the moment it was
--                collected (collected_at) — never the booking date.
-- Collected      verified collections only (0042: cod_transactions with
--                collected_amount, recorded at collection and frozen):
--                  COD           product_amount (goods money, owed to the
--                                sender; never ParcelLink revenue)
--                  delivery fee  collected_amount − product_amount (the
--                                sender's cash fee)
--                Attributed to cod_transactions.driver_id, as the driver's
--                balance (driver_cash_breakdown, 0048) is. 'expected' rows
--                are cash still to collect, never counted as collected;
--                pre-0042 rows without a recorded amount are "unverified"
--                and left out, as on the cash pages.
-- Charges        shipments.price: what the shipment costs, whoever pays
--                and however (card, or cash to the driver). A charge is not
--                a collection.
-- Outstanding    driver_cash_breakdown() (0048), unchanged: verified
--                collections − confirmed remittances. Pending submissions
--                are shown, never deducted. Always "now", never a period.
--
-- ── Who ──────────────────────────────────────────────────────────────────
-- Staff (operators and managers) — the same people who already see every
-- shipment and every driver's cash (shipments_select, cod_transactions and
-- driver_cash_remittances policies; there is no per-operator driver scope).
-- Anyone else gets nothing: an explicit is_staff() check, on top of RLS.
--
-- ── Also ─────────────────────────────────────────────────────────────────
-- driver_cod_stats (0021) summed every non-expected row's amount — COD and
-- delivery fee together, verified or not, and never reduced by a
-- remittance — and the driver's home page and the Drivers list showed it
-- as "COD collected". Its column stays as it was (other readers may rely
-- on it); cod_collected and fee_collected, verified and split, are added.

-- ── 1. Split, verified collection totals ─────────────────────────────────
create or replace view driver_cod_stats with (security_invoker = true) as
select
  driver_id,
  coalesce(sum(amount) filter (where status in ('collected', 'reconciled', 'remitted')), 0)::numeric(12, 2) as collected_total,
  coalesce(sum(product_amount) filter (where collected_amount is not null), 0)::numeric(12, 2) as cod_collected,
  coalesce(sum(collected_amount - product_amount) filter (where collected_amount is not null), 0)::numeric(12, 2) as fee_collected
from cod_transactions
where driver_id is not null
group by driver_id;

-- ── 2. The driver's shipments that match ─────────────────────────────────
-- One place for "which shipments": the list and the status counts both
-- read it, so a count is always the number of rows its filter shows.
-- Text: partial, case-insensitive, matched literally (LIKE wildcards
-- escaped), against the shipment id (a prefix), tracking number (and the
-- legacy one), sender and recipient names, pickup / drop-off address and
-- building, and — for a term without letters — both phone numbers by
-- phone_search_key() (0032), so any format matches. Stored values are
-- never rewritten.
create function staff_driver_shipments_matching(
  p_driver_id uuid,
  p_query text default null,
  p_from date default null,
  p_to date default null
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
      case
        when term.text is null then null
        else '%' || replace(replace(replace(term.text, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pattern,
      case when lower(term.text) ~ '^[0-9a-f-]{4,36}$' then lower(term.text) end as id_prefix,
      -- A phone number has no letters: a tracking number or an id is never
      -- also read as one (its digits would match unrelated phones).
      case
        when length(term.digits) < 3 or term.text ~ '[[:alpha:]]' then null
        when length(phone_search_key(term.digits)) >= 3 then phone_search_key(term.digits)
        else term.digits
      end as phone
    from term
  )
  select s.*
  from shipments s
  cross join params
  where (select is_staff())
    and p_driver_id is not null
    and s.driver_id = p_driver_id
    and (p_from is null or s.created_at >= (p_from::timestamp at time zone 'Asia/Dubai'))
    and (p_to is null or s.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Dubai'))
    and (
      params.pattern is null
      or (params.id_prefix is not null and s.id::text like params.id_prefix || '%')
      or s.tracking_number ilike params.pattern
      or s.legacy_tracking_number ilike params.pattern
      or s.pickup_contact_name ilike params.pattern
      or s.dropoff_contact_name ilike params.pattern
      or s.pickup_address ilike params.pattern
      or s.dropoff_address ilike params.pattern
      or s.pickup_building ilike params.pattern
      or s.dropoff_building ilike params.pattern
      or (
        params.phone is not null
        and (
          strpos(phone_search_key(s.pickup_contact_phone), params.phone) > 0
          or strpos(phone_search_key(s.dropoff_contact_phone), params.phone) > 0
        )
      )
    );
$$;

revoke execute on function staff_driver_shipments_matching(uuid, text, date, date) from public, anon;
grant execute on function staff_driver_shipments_matching(uuid, text, date, date) to authenticated;

-- ── 3. Counts by status ──────────────────────────────────────────────────
-- The app groups statuses into its filters (pending, in transit, …) from
-- these, so it never re-counts rows itself.
create function staff_driver_shipment_counts(
  p_driver_id uuid,
  p_query text default null,
  p_from date default null,
  p_to date default null
)
returns table (status shipment_status, shipments bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select m.status, count(*)
  from staff_driver_shipments_matching(p_driver_id, p_query, p_from, p_to) m
  group by m.status;
$$;

revoke execute on function staff_driver_shipment_counts(uuid, text, date, date) from public, anon;
grant execute on function staff_driver_shipment_counts(uuid, text, date, date) to authenticated;

-- ── 4. The list ──────────────────────────────────────────────────────────
-- One row per shipment (paged by PostgREST .range(), exact count). Each
-- shipment's own price and COD amount; what this driver collected on it
-- comes from a per-shipment aggregate, so several cash or status rows can
-- never repeat a shipment or add up to more than it holds.
--   cash_status     this driver's cash record for it: expected / collected /
--                   reconciled / remitted; null = no cash to collect.
--   cod_collected / fee_collected
--                   verified amounts; null = nothing verified collected.
--   cash_expected   still to collect (an 'expected' record).
--   unverified      collected before amounts were recorded (0042).
--   completed_at    when it reached its current status, for a finished
--                   one (delivered, failed, cancelled, returned).
create function staff_driver_shipments(
  p_driver_id uuid,
  p_query text default null,
  p_statuses shipment_status[] default null,
  p_from date default null,
  p_to date default null
)
returns table (
  id uuid,
  tracking_number text,
  status shipment_status,
  sender_name text,
  sender_phone text,
  recipient_name text,
  recipient_phone text,
  pickup_address text,
  dropoff_address text,
  created_at timestamptz,
  delivery_date date,
  completed_at timestamptz,
  delivery_type delivery_type,
  price numeric,
  currency text,
  payment_method payment_method,
  payment_status payment_status,
  recipient_payment_type recipient_payment_type,
  cod_amount numeric,
  cash_status text,
  cod_collected numeric,
  fee_collected numeric,
  cash_expected numeric,
  collected_at timestamptz,
  unverified boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.id, m.tracking_number, m.status,
    m.pickup_contact_name, m.pickup_contact_phone, m.dropoff_contact_name, m.dropoff_contact_phone,
    m.pickup_address, m.dropoff_address, m.created_at, m.delivery_date,
    case when m.status in ('delivered', 'delivery_failed', 'cancelled', 'returned') then (
      select max(h.created_at) from shipment_status_history h where h.shipment_id = m.id and h.status = m.status
    ) end,
    m.delivery_type, m.price, m.currency, m.payment_method, m.payment_status, m.recipient_payment_type, m.cod_amount,
    cash.status, cash.cod, cash.fee, cash.expected, cash.collected_at, coalesce(cash.unverified, false)
  from staff_driver_shipments_matching(p_driver_id, p_query, p_from, p_to) m
  left join lateral (
    select
      (array_agg(c.status::text order by c.created_at desc, c.id desc))[1] as status,
      sum(c.product_amount) filter (where c.collected_amount is not null)::numeric(12, 2) as cod,
      sum(c.collected_amount - c.product_amount) filter (where c.collected_amount is not null)::numeric(12, 2) as fee,
      sum(c.amount) filter (where c.status = 'expected')::numeric(12, 2) as expected,
      max(c.collected_at) filter (where c.collected_amount is not null) as collected_at,
      bool_or(c.status <> 'expected' and c.collected_amount is null) as unverified
    from cod_transactions c
    where c.shipment_id = m.id and c.driver_id = p_driver_id
    having count(*) > 0
  ) cash on true
  where p_statuses is null or m.status = any (p_statuses)
  order by m.created_at desc, m.id desc;
$$;

revoke execute on function staff_driver_shipments(uuid, text, shipment_status[], date, date) from public, anon;
grant execute on function staff_driver_shipments(uuid, text, shipment_status[], date, date) to authenticated;

-- ── 5. The driver and their money ────────────────────────────────────────
-- Who they are, charges on their shipments booked in the period, cash
-- collected in the period (by collected_at), cash still to collect, and
-- their position now. Staff only; null for anyone else or a non-driver.
create function staff_driver_overview(p_driver_id uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := case when p_from is null then null else p_from::timestamp at time zone 'Asia/Dubai' end;
  v_to timestamptz := case when p_to is null then null else (p_to + 1)::timestamp at time zone 'Asia/Dubai' end;
  v_driver record;
  v_pos record;
  v_period record;
  v_charges record;
  v_now record;
begin
  if p_driver_id is null or not is_staff() then
    return null;
  end if;

  select p.id, p.full_name, p.phone, p.active, d.driver_code, d.availability,
    nullif(btrim(concat_ws(' ', v.make, v.model)), '') as vehicle
  into v_driver
  from profiles p
  join driver_profiles d on d.profile_id = p.id
  left join vehicles v on v.id = d.vehicle_id
  where p.id = p_driver_id and p.role = 'driver';
  if not found then
    return null;
  end if;

  select * into v_pos from driver_cash_breakdown(p_driver_id);

  select
    coalesce(sum(product_amount), 0)::numeric(12, 2) as cod,
    coalesce(sum(collected_amount - product_amount), 0)::numeric(12, 2) as fee,
    count(distinct shipment_id) as shipments
  into v_period
  from cod_transactions
  where driver_id = p_driver_id and collected_amount is not null
    and (v_from is null or collected_at >= v_from) and (v_to is null or collected_at < v_to);

  -- Each shipment once (shipments has one row per shipment); cancelled
  -- ones carry no charge.
  select
    coalesce(sum(price) filter (where status <> 'cancelled'), 0)::numeric(12, 2) as charges,
    coalesce(sum(price) filter (where status <> 'cancelled' and payment_method = 'cod'), 0)::numeric(12, 2) as cash_charges,
    coalesce(sum(cod_amount) filter (where status <> 'cancelled' and recipient_payment_type = 'postpaid'), 0)::numeric(12, 2) as cod_due
  into v_charges
  from shipments
  where driver_id = p_driver_id
    and (v_from is null or created_at >= v_from) and (v_to is null or created_at < v_to);

  select
    coalesce(sum(product_amount) filter (where status = 'expected'), 0)::numeric(12, 2) as expected_cod,
    coalesce(sum(delivery_fee_amount) filter (where status = 'expected'), 0)::numeric(12, 2) as expected_fee,
    coalesce(sum(amount) filter (where status <> 'expected' and collected_amount is null), 0)::numeric(12, 2) as unverified
  into v_now
  from cod_transactions
  where driver_id = p_driver_id;

  return jsonb_build_object(
    'driver', jsonb_build_object(
      'id', v_driver.id, 'name', v_driver.full_name, 'phone', v_driver.phone, 'active', v_driver.active,
      'code', v_driver.driver_code, 'availability', v_driver.availability, 'vehicle', v_driver.vehicle
    ),
    'period', jsonb_build_object(
      'codCollected', v_period.cod,
      'feeCollected', v_period.fee,
      'collectedShipments', v_period.shipments,
      'charges', v_charges.charges,
      'cashCharges', v_charges.cash_charges,
      'codDue', v_charges.cod_due
    ),
    'now', jsonb_build_object(
      'outstanding', v_pos.outstanding,
      'outstandingCod', (v_pos.collected_cod - v_pos.confirmed_cod)::numeric(12, 2),
      'outstandingFee', (v_pos.collected_fee - v_pos.confirmed_fee)::numeric(12, 2),
      'confirmed', (v_pos.confirmed_cod + v_pos.confirmed_fee + v_pos.confirmed_unclassified)::numeric(12, 2),
      'pending', (v_pos.pending_cod + v_pos.pending_fee + v_pos.pending_unclassified)::numeric(12, 2),
      'expectedCod', v_now.expected_cod,
      'expectedFee', v_now.expected_fee,
      'unverified', v_now.unverified
    )
  );
end;
$$;

revoke execute on function staff_driver_overview(uuid, date, date) from public, anon;
grant execute on function staff_driver_overview(uuid, date, date) to authenticated;
