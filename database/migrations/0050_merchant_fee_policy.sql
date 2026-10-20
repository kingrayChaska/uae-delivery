-- Merchant delivery fees: no fee on COD shipments, volume tiers otherwise,
-- and never cash for the driver to collect.
--
-- ── What was wrong ───────────────────────────────────────────────────────
-- 1. Every merchant shipment cost the flat merchant rule (0033: AED 15 +
--    weight surcharge, + the rule's COD fee when postpaid), COD or not, at
--    any volume.
-- 2. The fee was cash for the driver. Since 0048 every shipment is "cash"
--    (payment_method 'cod': the delivery fee paid in cash), and the 0022
--    sync trigger puts a cash-paid fee on the driver's COD record
--    (delivery_fee_amount = price). So a driver was shown, asked to collect
--    and asked to remit the merchant's fee — on a merchant COD shipment,
--    COD + fee. 0046's price edit wrote the same fee to the same record.
--
-- ── The policy (confirmed with the business, 2026-10-20) ─────────────────
-- merchant_fee_policy(delivery type, recipient payment, order count):
--   postpaid (COD to collect)          'cod_no_fee'       AED 0 — no fee at all
--   Next-Day, 5 or more orders         'next_day_5_plus'  AED 15 flat
--   Next-Day, 2–4 orders               'next_day_2_4'     AED 20 flat
--   anything else (one order, any      'unconfirmed'      today's merchant rule,
--   Same-Day order)                                       unchanged (AED 15 +
--                                                         weight surcharge),
--                                                         flagged until a rate
--                                                         is set
-- "1–2 days" in the brief is the existing Next-Day service. Flat means
-- flat: no distance, weight or COD-handling charge on top. The rates live
-- here and in lib/pricing/merchant-fees.ts (tested to agree); changing them
-- is a migration, like 0033.
--
-- Order count = the shipments booked together: one booking with several
-- shipments, or one bulk upload, is one shipment_batches row (0020/0022/
-- 0026); a booking without a batch is one order. COD and non-COD shipments
-- of a booking both count. It is fixed when the booking is finalized
-- (shipment_batches leaves 'processing'): a later cancellation doesn't
-- re-price the rest. Shipments of other merchants never count.
--
-- ── Who sets the price ───────────────────────────────────────────────────
-- The database. shipments_price_merchant (BEFORE INSERT) prices every
-- merchant shipment from the policy, whoever books it (merchant, staff,
-- bulk upload) and whatever the request said; a batch row is first priced
-- on the running count, and reprice_merchant_batch() sets the final tier
-- for all of them when the batch is finalized. The browser can't claim a
-- bigger booking to get a cheaper tier. shipments_insert accepts a
-- merchant row because it was priced here (merchant_fee_tier is only ever
-- set by that trigger); every other row is checked by
-- shipment_price_is_valid() as before. Repeated submissions can't charge
-- twice: one shipment per client_request_id (0019), one price per shipment.
--
-- ── Never the driver's cash ──────────────────────────────────────────────
-- shipments.fee_billed: the delivery fee is billed to the merchant account
-- (invoice / merchant statement, 0031/0044) and is never cash a driver
-- collects. cod_transactions_billed_fee (BEFORE INSERT OR UPDATE) keeps the
-- fee off every 'expected' record of such a shipment, from any writer (the
-- 0022 sync, 0046's price edit, anything later): the record is the COD
-- amount alone, and isn't created when there's no COD. Collected records
-- are history and are never changed. Individual customers' cash fees are
-- unchanged — they do pay the driver.
--
-- Statements already bill it: service_charge = price, payments_received =
-- verified cash fees (now none for these). The 1.5% cash handling fee of
-- 0044/0045 is a merchant-statement charge on goods paid out to the
-- merchant; it was never taken from a driver's remittance and still isn't.
--
-- ── Existing shipments ───────────────────────────────────────────────────
-- Open merchant shipments (not delivered, cancelled or returned; fee
-- neither paid nor collected) become fee_billed, and their expected cash
-- records lose the fee (removed when nothing is left to collect). Those
-- not yet invoiced, on a statement or price-edited by staff are re-priced
-- under the policy at their booking's size, each with an audit row. All
-- other records — collected cash, paid fees, invoices, statements — stay
-- exactly as they are.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Columns
-- ════════════════════════════════════════════════════════════════════════
alter table shipments
  add column fee_billed boolean not null default false,
  add column merchant_fee_tier text
    check (merchant_fee_tier in ('cod_no_fee', 'next_day_5_plus', 'next_day_2_4', 'unconfirmed')),
  add column merchant_order_count integer check (merchant_order_count is null or merchant_order_count >= 1);

-- ════════════════════════════════════════════════════════════════════════
-- 2. The policy
-- ════════════════════════════════════════════════════════════════════════
-- The tier and its flat fee; fee null = the merchant rule applies.
create function merchant_fee_policy(
  p_delivery_type delivery_type,
  p_recipient_payment_type recipient_payment_type,
  p_order_count integer
)
returns table (tier text, fee numeric)
language sql
immutable
set search_path = public
as $$
  select
    case
      when p_recipient_payment_type = 'postpaid' then 'cod_no_fee'
      when p_delivery_type = 'next_day' and p_order_count >= 5 then 'next_day_5_plus'
      when p_delivery_type = 'next_day' and p_order_count between 2 and 4 then 'next_day_2_4'
      else 'unconfirmed'
    end,
    case
      when p_recipient_payment_type = 'postpaid' then 0::numeric
      when p_delivery_type = 'next_day' and p_order_count >= 5 then 15::numeric
      when p_delivery_type = 'next_day' and p_order_count between 2 and 4 then 20::numeric
    end;
$$;

grant execute on function merchant_fee_policy(delivery_type, recipient_payment_type, integer) to authenticated;

-- Every charge of a merchant shipment under the policy, with the active
-- merchant rule for its service (kept as pricing_rule_id, and used as-is
-- for 'unconfirmed'). Rounding as shipment_price_is_valid() (0022).
create function merchant_shipment_charges(
  p_delivery_type delivery_type,
  p_recipient_payment_type recipient_payment_type,
  p_order_count integer,
  p_distance_km numeric,
  p_weight_kg numeric
)
returns table (
  rule_id uuid, tier text, base_charge numeric, distance_charge numeric, weight_charge numeric, cod_charge numeric, price numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select
      r.id, p.tier,
      coalesce(p.fee, r.base_price)::numeric(10, 2) as base,
      case when p.fee is not null then 0
        else round(greatest(p_distance_km - r.base_distance_km, 0) * r.additional_price_per_km, 2) end::numeric(10, 2) as distance,
      case when p.fee is not null then 0
        else round(greatest(coalesce(p_weight_kg, 0) - r.included_weight_kg, 0) * r.additional_price_per_kg, 2) end::numeric(10, 2) as weight,
      case when p.fee is not null or p_recipient_payment_type <> 'postpaid' then 0 else r.cod_fee end::numeric(10, 2) as cod
    from pricing_rules r
    cross join merchant_fee_policy(p_delivery_type, p_recipient_payment_type, p_order_count) p
    where r.is_active and r.account_type = 'merchant' and r.delivery_type = p_delivery_type
  )
  select id, tier, base, distance, weight, cod, (base + distance + weight + cod)::numeric(10, 2) from c;
$$;

revoke execute on function merchant_shipment_charges(delivery_type, recipient_payment_type, integer, numeric, numeric) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Priced by the database at booking
-- ════════════════════════════════════════════════════════════════════════
create function price_merchant_shipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_c record;
begin
  -- Client sessions only (merchants, staff, the bulk upload — every app
  -- booking path inserts with the user's own session). Trusted code
  -- (service role, migrations, test fixtures) keeps the values it wrote,
  -- as with 0048's cash-only rule; no app path inserts shipments that way.
  -- This function runs as its owner, so current_user can't tell: the
  -- session's role setting (what PostgREST sets per request) can.
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then
    return new;
  end if;

  if not exists (select 1 from profiles where id = new.customer_id and account_type = 'merchant') then
    -- Not a merchant's: nothing here applies, whatever the request said.
    new.fee_billed := false;
    new.merchant_fee_tier := null;
    new.merchant_order_count := null;
    return new;
  end if;

  -- A merchant booking names its merchant rule (or none) and — unless staff
  -- book it, who were always exempt from the price check — a weight, as
  -- shipment_price_is_valid() required; anything else is a forged request.
  if new.pricing_rule_id is not null and not exists (
    select 1 from pricing_rules
    where id = new.pricing_rule_id and is_active and account_type = 'merchant' and delivery_type = new.delivery_type
  ) then
    raise exception 'This is not a merchant price';
  end if;
  if new.package_weight_kg is null and not is_staff() then
    raise exception 'Merchant shipments need the package weight';
  end if;

  -- Provisional while the booking is still being created: the shipments
  -- of this batch so far, this one included. Final at finalize (below).
  v_count := case when new.batch_id is null then 1
    else 1 + (select count(*) from shipments where batch_id = new.batch_id and status <> 'cancelled') end;

  select * into v_c
  from merchant_shipment_charges(new.delivery_type, new.recipient_payment_type, v_count, new.distance_km, new.package_weight_kg);
  if not found then
    raise exception 'No merchant price is set for this delivery service';
  end if;
  -- A booking of one is final now: the price the app quoted must be the
  -- policy's, as shipment_price_is_valid() required. A batch row is priced
  -- here provisionally and set at finalize, so it isn't compared.
  if new.batch_id is null and round(new.price, 2) <> v_c.price and not is_staff() then
    raise exception 'This is not the merchant price for this shipment';
  end if;

  new.pricing_rule_id := v_c.rule_id;
  new.base_charge := v_c.base_charge;
  new.distance_charge := v_c.distance_charge;
  new.weight_charge := v_c.weight_charge;
  new.cod_charge := v_c.cod_charge;
  -- Staff change a booked price with the Edit price action (0046), never
  -- at insert.
  new.price_adjustment := 0;
  new.price := v_c.price;
  new.merchant_fee_tier := v_c.tier;
  new.merchant_order_count := v_count;
  new.fee_billed := true;
  return new;
end;
$$;

revoke execute on function price_merchant_shipment() from public, anon, authenticated;

create trigger shipments_price_merchant
  before insert on shipments
  for each row execute function price_merchant_shipment();

-- As 0040, plus: a merchant row was priced by the trigger above.
drop policy shipments_insert on shipments;
create policy shipments_insert on shipments
  for insert
  with check (
    (customer_id = (select auth.uid()) or (select is_staff()))
    and (booked_by is null or booked_by = (select auth.uid()))
    and (
      (select is_staff())
      or merchant_fee_tier is not null
      or shipment_price_is_valid(
        customer_id, pricing_rule_id, delivery_type, distance_km, package_weight_kg, recipient_payment_type,
        base_charge, distance_charge, weight_charge, cod_charge, price, currency
      )
    )
  );

-- 0006's guard ran as its owner (SECURITY DEFINER), so it refused price
-- changes even from the database's own functions. Now, like 0046's
-- enforce_shipment_update_permissions, it judges client sessions only:
-- trusted code (service role, migrations, SECURITY DEFINER functions)
-- keeps its own checks.
create or replace function prevent_shipment_pricing_tampering()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not is_staff() then
    if new.price is distinct from old.price
      or new.distance_km is distinct from old.distance_km
      or new.duration_minutes is distinct from old.duration_minutes
      or new.currency is distinct from old.currency
      or new.pricing_rule_id is distinct from old.pricing_rule_id
      or new.payment_status is distinct from old.payment_status
      or new.fee_billed is distinct from old.fee_billed
      or new.merchant_fee_tier is distinct from old.merchant_fee_tier
      or new.merchant_order_count is distinct from old.merchant_order_count
    then
      raise exception 'Pricing and payment_status can only be changed by staff';
    end if;
  end if;
  return new;
end;
$$;

-- Staff can't flip these by hand either: they follow the policy.
create function guard_merchant_fee_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
    and (new.fee_billed is distinct from old.fee_billed
      or new.merchant_fee_tier is distinct from old.merchant_fee_tier
      or new.merchant_order_count is distinct from old.merchant_order_count)
  then
    raise exception 'The merchant fee tier is set by the pricing policy';
  end if;
  return new;
end;
$$;

revoke execute on function guard_merchant_fee_columns() from public, anon, authenticated;

create trigger shipments_guard_merchant_fee
  before update on shipments
  for each row execute function guard_merchant_fee_columns();

-- ════════════════════════════════════════════════════════════════════════
-- 4. Final tier when the booking is finalized
-- ════════════════════════════════════════════════════════════════════════
-- Why an open merchant shipment's price must not move now (null = it may):
-- 0046's reasons (closed, fee paid or collected, on a statement), an
-- issued invoice, or a staff price edit.
create function merchant_fee_reprice_block(p_shipment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    shipment_price_edit_block(s.id),
    case when exists (select 1 from shipment_live_invoice(s.id)) then 'invoiced' end,
    case when s.price_adjustment <> 0 then 'adjusted' end
  )
  from shipments s where s.id = p_shipment_id;
$$;

revoke execute on function merchant_fee_reprice_block(uuid) from public, anon, authenticated;

-- Prices every merchant shipment of a batch at the batch's size (its
-- non-cancelled shipments), keeping the booked bulk row's fee in step.
-- Idempotent; returns how many prices changed.
create function reprice_merchant_batch(p_batch_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_changed integer := 0;
  v_ship shipments%rowtype;
  v_c record;
begin
  select count(*) into v_count from shipments where batch_id = p_batch_id and status <> 'cancelled';
  if v_count = 0 then
    return 0;
  end if;

  for v_ship in
    select s.* from shipments s
    join profiles p on p.id = s.customer_id and p.account_type = 'merchant'
    where s.batch_id = p_batch_id and s.fee_billed and s.status <> 'cancelled'
    order by s.created_at, s.id
    for update of s
  loop
    continue when merchant_fee_reprice_block(v_ship.id) is not null;
    select * into v_c
    from merchant_shipment_charges(v_ship.delivery_type, v_ship.recipient_payment_type, v_count, v_ship.distance_km, v_ship.package_weight_kg);
    continue when not found;
    continue when v_c.price = v_ship.price and v_c.tier is not distinct from v_ship.merchant_fee_tier
      and v_ship.merchant_order_count is not distinct from v_count;

    update shipments
    set pricing_rule_id = v_c.rule_id, base_charge = v_c.base_charge, distance_charge = v_c.distance_charge,
        weight_charge = v_c.weight_charge, cod_charge = v_c.cod_charge, price = v_c.price,
        merchant_fee_tier = v_c.tier, merchant_order_count = v_count
    where id = v_ship.id;

    if v_c.price <> v_ship.price then
      v_changed := v_changed + 1;
      -- The bulk row it was booked from (client_request_id = row id).
      update shipment_batch_rows r
      set delivery_fee = v_c.price,
          quote = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(r.quote,
            '{booking,ruleId}', to_jsonb(v_c.rule_id::text)),
            '{booking,breakdown,basePrice}', to_jsonb(v_c.base_charge)),
            '{booking,breakdown,distanceCharge}', to_jsonb(v_c.distance_charge)),
            '{booking,breakdown,weightCharge}', to_jsonb(v_c.weight_charge)),
            '{booking,breakdown,codCharge}', to_jsonb(v_c.cod_charge)),
            '{booking,breakdown,totalPrice}', to_jsonb(v_c.price))
      where r.batch_id = p_batch_id and r.id = v_ship.client_request_id and r.quote ? 'booking';

      insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
      values (auth.uid(), 'shipment.merchant_fee_policy', 'shipment', v_ship.id,
        jsonb_build_object('price', v_ship.price, 'tier', v_ship.merchant_fee_tier, 'orderCount', v_ship.merchant_order_count),
        jsonb_build_object('price', v_c.price, 'tier', v_c.tier, 'orderCount', v_count, 'reason', p_reason));
    end if;
  end loop;
  return v_changed;
end;
$$;

revoke execute on function reprice_merchant_batch(uuid, text) from public, anon, authenticated;

create function finalize_merchant_batch_fees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'processing' and new.status in ('submitted', 'partially_failed') then
    perform reprice_merchant_batch(new.id, 'Booking finalized: ' || new.reference);
  end if;
  return new;
end;
$$;

revoke execute on function finalize_merchant_batch_fees() from public, anon, authenticated;

create trigger shipment_batches_finalize_merchant_fees
  after update of status on shipment_batches
  for each row execute function finalize_merchant_batch_fees();

-- ════════════════════════════════════════════════════════════════════════
-- 5. A billed fee is never the driver's cash
-- ════════════════════════════════════════════════════════════════════════
create function keep_billed_fee_off_driver_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'expected'
    and exists (select 1 from shipments where id = new.shipment_id and fee_billed)
  then
    new.delivery_fee_amount := 0;
    new.amount := new.product_amount;
    -- Nothing to collect at all (a merchant shipment without COD): no record.
    if tg_op = 'INSERT' and new.amount = 0 then
      return null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function keep_billed_fee_off_driver_cash() from public, anon, authenticated;

-- Named to run before cod_transactions_prevent_tampering (0022) and
-- cod_transactions_record_collection (0042): BEFORE triggers fire by name.
create trigger cod_transactions_billed_fee
  before insert or update on cod_transactions
  for each row execute function keep_billed_fee_off_driver_cash();

-- ════════════════════════════════════════════════════════════════════════
-- 6. Existing shipments
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_billed integer;
  v_stripped integer;
  v_removed integer;
  v_repriced integer;
begin
  -- Open, fee neither paid nor collected: billed from now on.
  update shipments s
  set fee_billed = true
  from profiles p
  where p.id = s.customer_id and p.account_type = 'merchant'
    and s.status not in ('delivered', 'cancelled', 'returned')
    and s.payment_status not in ('paid', 'refunded')
    and not exists (select 1 from payments pay where pay.shipment_id = s.id and pay.status in ('paid', 'refunded'))
    and not exists (
      select 1 from cod_transactions c where c.shipment_id = s.id and c.status <> 'expected' and c.delivery_fee_amount > 0
    );
  get diagnostics v_billed = row_count;

  -- Their expected cash records: the COD amount only (the trigger above
  -- does it on update); nothing left to collect = no record.
  update cod_transactions c set status = c.status
  from shipments s
  where s.id = c.shipment_id and s.fee_billed and c.status = 'expected' and c.delivery_fee_amount > 0;
  get diagnostics v_stripped = row_count;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  select null, 'cod_transaction.billed_fee_removed', 'shipment', c.shipment_id,
    jsonb_build_object('amount', c.amount), jsonb_build_object('amount', 0, 'reason', 'Merchant fee billed, not driver cash (migration 0050)')
  from cod_transactions c join shipments s on s.id = c.shipment_id
  where s.fee_billed and c.status = 'expected' and c.amount = 0;
  delete from cod_transactions c using shipments s
  where s.id = c.shipment_id and s.fee_billed and c.status = 'expected' and c.amount = 0;
  get diagnostics v_removed = row_count;

  -- Re-price what may move, at the size it was booked at.
  -- Size = the shipments booked together in its batch (one without a batch
  -- is one order).
  create temporary table policy_targets on commit drop as
  select s.id, s.price as old_price, n.order_count, c.*
  from shipments s
  cross join lateral (
    select case when s.batch_id is null then 1 else (select count(*) from shipments b where b.batch_id = s.batch_id) end::integer as order_count
  ) n
  cross join lateral merchant_shipment_charges(s.delivery_type, s.recipient_payment_type, n.order_count, s.distance_km, s.package_weight_kg) c
  where s.fee_billed and merchant_fee_reprice_block(s.id) is null;

  update shipments s
  set pricing_rule_id = t.rule_id, base_charge = t.base_charge, distance_charge = t.distance_charge,
      weight_charge = t.weight_charge, cod_charge = t.cod_charge, price = t.price,
      merchant_fee_tier = t.tier, merchant_order_count = t.order_count
  from policy_targets t
  where s.id = t.id;
  get diagnostics v_repriced = row_count;

  update shipment_batch_rows r
  set delivery_fee = s.price,
      quote = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(r.quote,
        '{booking,ruleId}', to_jsonb(s.pricing_rule_id::text)),
        '{booking,breakdown,basePrice}', to_jsonb(s.base_charge)),
        '{booking,breakdown,distanceCharge}', to_jsonb(s.distance_charge)),
        '{booking,breakdown,weightCharge}', to_jsonb(s.weight_charge)),
        '{booking,breakdown,codCharge}', to_jsonb(s.cod_charge)),
        '{booking,breakdown,totalPrice}', to_jsonb(s.price))
  from policy_targets t
  join shipments s on s.id = t.id
  where r.batch_id = s.batch_id and r.id = s.client_request_id and r.quote ? 'booking' and s.price <> t.old_price;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  select null, 'shipment.merchant_fee_policy', 'shipment', t.id,
    jsonb_build_object('price', t.old_price),
    jsonb_build_object('price', s.price, 'tier', s.merchant_fee_tier, 'orderCount', s.merchant_order_count,
      'reason', 'Merchant fee policy (migration 0050)')
  from policy_targets t join shipments s on s.id = t.id
  where s.price <> t.old_price;

  -- Merchant drafts not yet booked are validated again, so their fees
  -- follow the policy the usual way.
  update shipment_batch_rows r
  set status = 'pending', claimed_at = null
  from shipment_batches b
  where b.id = r.batch_id and b.status = 'draft' and r.status in ('valid', 'warning');

  raise notice 'Merchant fee policy: % open shipments billed, % cash records cleared of the fee (% removed), % re-priced',
    v_billed, v_stripped, v_removed, v_repriced;
end;
$$;
