-- Existing merchant shipments: move to the AED 15 flat rate (migration 0033).
--
-- Merchant shipments booked under the old merchant rates (Next-Day AED 10
-- from migration 0022, or any other merchant rate since replaced) are
-- repriced under the active merchant rule for their service — the AED 15
-- flat rule — with every charge re-derived exactly as
-- shipment_price_is_valid() (migration 0022) derives it: AED 15, plus the
-- rule's weight charge over the included weight and its COD fee for
-- postpaid shipments. Each repriced shipment is then checked with
-- shipment_price_is_valid() itself; if any would fail, nothing changes.
--
-- Left at the price they were booked at: shipments whose fee has already
-- been paid — a card payment recorded as paid, or a cash delivery fee a
-- driver has collected (a COD record past 'expected', or a delivered cash
-- shipment). Their price, invoice and cash records keep matching the money
-- actually received. The NOTICE at the end lists them.
--
-- Everything that carries a repriced shipment's fee follows it:
--   * the expected COD record (what the driver collects) — fee and total;
--   * a pending card payment's amount;
--   * issued invoices with a repriced shipment on them are voided (the
--     correction path of migration 0031: invoices are never edited); the
--     merchant or staff issue a new one from the shipment or bulk page,
--     and both stay on record;
--   * a booked bulk row's stored fee and quote;
--   * bulk drafts not yet booked are sent back to validation ('pending'),
--     so the app re-prices them under the AED 15 rule the usual way.
-- Every repriced shipment gets an audit entry. Notifications don't fire:
-- they follow status and driver changes only.
--
-- Running it again changes nothing: repriced shipments are already on the
-- active rule.

do $$
declare
  v_repriced integer;
  v_invalid text;
  v_voided text;
  v_kept text;
  v_drafts integer;
begin
  create temporary table reprice_targets on commit drop as
  select
    s.id,
    s.tracking_number,
    s.price as old_price,
    s.pricing_rule_id as old_rule_id,
    s.base_charge as old_base_charge,
    n.id as new_rule_id,
    n.base_price as base_charge,
    round(greatest(s.distance_km - n.base_distance_km, 0) * n.additional_price_per_km, 2) as distance_charge,
    round(greatest(coalesce(s.package_weight_kg, 0) - n.included_weight_kg, 0) * n.additional_price_per_kg, 2) as weight_charge,
    case when s.recipient_payment_type = 'postpaid' then n.cod_fee else 0 end as cod_charge
  from shipments s
  join profiles p on p.id = s.customer_id and p.account_type = 'merchant'
  join pricing_rules old_rule on old_rule.id = s.pricing_rule_id and old_rule.account_type = 'merchant'
  join pricing_rules n on n.is_active and n.account_type = 'merchant' and n.delivery_type = s.delivery_type
  where s.pricing_rule_id <> n.id
    -- Only onto the AED 15 flat rule, and only from a different rate.
    and n.base_price = 15
    and n.additional_price_per_km = 0
    and old_rule.base_price <> n.base_price
    -- Fee not yet paid.
    and s.payment_status <> 'paid'
    and not exists (select 1 from payments pay where pay.shipment_id = s.id and pay.status = 'paid')
    and not exists (
      select 1 from cod_transactions c
      where c.shipment_id = s.id and c.status <> 'expected' and c.delivery_fee_amount > 0
    )
    and not (s.payment_method = 'cod' and s.status = 'delivered');

  alter table reprice_targets add column price numeric(10, 2);
  update reprice_targets set price = base_charge + distance_charge + weight_charge + cod_charge;

  -- The database's own price check must accept every new price.
  select string_agg(t.tracking_number, ', ' order by t.tracking_number) into v_invalid
  from reprice_targets t
  join shipments s on s.id = t.id
  where not shipment_price_is_valid(
    s.customer_id, t.new_rule_id, s.delivery_type, s.distance_km, s.package_weight_kg, s.recipient_payment_type,
    t.base_charge, t.distance_charge, t.weight_charge, t.cod_charge, t.price, s.currency
  );
  if v_invalid is not null then
    raise exception 'Repricing stopped, nothing changed: these shipments would not pass the price check: %', v_invalid;
  end if;

  -- Price changes are refused for any session that isn't staff
  -- (migration 0006); a migration has no session, so the guard is paused
  -- for this one statement, inside this transaction.
  alter table shipments disable trigger shipments_prevent_pricing_tampering;
  update shipments s
  set pricing_rule_id = t.new_rule_id,
      base_charge = t.base_charge,
      distance_charge = t.distance_charge,
      weight_charge = t.weight_charge,
      cod_charge = t.cod_charge,
      price = t.price
  from reprice_targets t
  where s.id = t.id;
  get diagnostics v_repriced = row_count;
  alter table shipments enable trigger shipments_prevent_pricing_tampering;

  -- What the driver will collect: the fee part of a cash shipment's
  -- expected COD record (the goods amount is unchanged).
  update cod_transactions c
  set delivery_fee_amount = t.price,
      amount = c.product_amount + t.price
  from reprice_targets t
  join shipments s on s.id = t.id
  where c.shipment_id = t.id
    and c.status = 'expected'
    and s.payment_method = 'cod';

  update payments pay
  set amount = t.price
  from reprice_targets t
  where pay.shipment_id = t.id and pay.status = 'pending';

  -- Invoices with a repriced shipment on them.
  with voided as (
    update invoices i
    set status = 'void',
        voided_at = now(),
        void_reason = 'Merchant delivery fee corrected to AED 15 (migration 0034). Issue a new invoice for the corrected amount.'
    where i.status = 'issued'
      and exists (select 1 from invoice_line_items l join reprice_targets t on t.id = l.shipment_id where l.invoice_id = i.id)
    returning i.invoice_number
  )
  select string_agg(invoice_number, ', ' order by invoice_number) into v_voided from voided;

  -- Booked bulk rows (each shipment's client_request_id is its row id).
  update shipment_batch_rows r
  set delivery_fee = t.price,
      quote = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(r.quote,
        '{booking,ruleId}', to_jsonb(t.new_rule_id::text)),
        '{booking,breakdown,basePrice}', to_jsonb(t.base_charge)),
        '{booking,breakdown,distanceCharge}', to_jsonb(t.distance_charge)),
        '{booking,breakdown,weightCharge}', to_jsonb(t.weight_charge)),
        '{booking,breakdown,codCharge}', to_jsonb(t.cod_charge)),
        '{booking,breakdown,totalPrice}', to_jsonb(t.price))
  from reprice_targets t
  join shipments s on s.id = t.id
  where r.id = s.client_request_id
    and r.batch_id = s.batch_id
    and r.quote ? 'booking';

  -- Bulk drafts quoted under a retired merchant rate: validated again.
  update shipment_batch_rows r
  set status = 'pending', claimed_at = null
  from shipment_batches b
  where b.id = r.batch_id
    and b.status = 'draft'
    and r.status in ('valid', 'warning')
    and (r.quote -> 'booking' ->> 'ruleId') in (
      select id::text from pricing_rules where account_type = 'merchant' and not is_active
    );
  get diagnostics v_drafts = row_count;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  select
    null,
    'shipment.reprice',
    'shipment',
    t.id,
    jsonb_build_object('price', t.old_price, 'base_charge', t.old_base_charge, 'pricing_rule_id', t.old_rule_id),
    jsonb_build_object('price', t.price, 'base_charge', t.base_charge, 'pricing_rule_id', t.new_rule_id, 'reason', 'Merchant flat rate AED 15 (migration 0034)')
  from reprice_targets t;

  -- Already paid at the old rate, so left as booked.
  select string_agg(s.tracking_number || ' (AED ' || s.price || ')', ', ' order by s.tracking_number) into v_kept
  from shipments s
  join pricing_rules old_rule on old_rule.id = s.pricing_rule_id and old_rule.account_type = 'merchant'
  join pricing_rules n on n.is_active and n.account_type = 'merchant' and n.delivery_type = s.delivery_type
  where s.pricing_rule_id <> n.id and old_rule.base_price <> n.base_price;

  raise notice 'Merchant repricing: % shipment(s) moved to AED 15; % bulk draft row(s) sent back to validation; voided invoices: %; left at the price already paid: %',
    v_repriced, v_drafts, coalesce(v_voided, 'none'), coalesce(v_kept, 'none');
end;
$$;
