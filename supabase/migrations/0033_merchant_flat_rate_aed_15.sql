-- Merchant delivery fee: a flat AED 15 for Same-Day and Next-Day alike.
--
-- Migration 0022 seeded the merchant flat rates as starting values —
-- Same-Day AED 15 and Next-Day AED 10 — and the Next-Day one is the AED 10
-- merchants were being charged. Merchant prices come only from the active
-- pricing_rules row for (delivery_type, account_type = 'merchant'): the
-- booking (quoteShipment), merchant CSV uploads (the same quoteShipment,
-- and recheck() before booking) and the database's own price check
-- (shipment_price_is_valid) all read it, with the account type taken from
-- the customer's profile, never from the browser. So the fix is the rule
-- itself; no code computes AED 10.
--
-- Rules are never edited in place (lib/pricing/actions.ts): a change is a
-- new row, which pricing_rules_enforce_single_active makes the active one,
-- so every shipment already booked keeps pointing at the rule — and the
-- price — it was booked under. This does exactly what saving AED 15 on the
-- manager's Pricing page does, for each merchant service whose active rule
-- isn't already a flat AED 15. Everything else on the rule (included
-- weight and its per-kg charge, COD fee, distance limit) is kept.
-- Individual rules are not touched.

do $$
declare
  v_type delivery_type;
  v_old pricing_rules%rowtype;
  v_new_id uuid;
begin
  foreach v_type in array array['same_day', 'next_day']::delivery_type[] loop
    select * into v_old
    from pricing_rules
    where is_active and account_type = 'merchant' and delivery_type = v_type;

    if found and v_old.base_price = 15 and v_old.additional_price_per_km = 0 then
      continue;
    end if;

    insert into pricing_rules (
      name, delivery_type, account_type, base_distance_km, base_price, additional_price_per_km,
      included_weight_kg, additional_price_per_kg, cod_fee, max_distance_km, currency, is_active
    )
    values (
      case v_type when 'same_day' then 'Merchant Same-Day Flat' else 'Merchant Next-Day Flat' end,
      v_type,
      'merchant',
      coalesce(v_old.base_distance_km, 50),
      15,
      0,
      coalesce(v_old.included_weight_kg, 20),
      coalesce(v_old.additional_price_per_kg, 1),
      coalesce(v_old.cod_fee, 0),
      -- null = no limit, as merchant rules have been since migration 0027.
      case when v_old.id is null then null else v_old.max_distance_km end,
      'AED',
      true
    )
    returning id into v_new_id;

    -- The same trail a manager's change leaves (pricing.create_and_activate).
    insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (
      null,
      'pricing.create_and_activate',
      'pricing_rule',
      v_new_id,
      case when v_old.id is null then null else to_jsonb(v_old) end,
      (select to_jsonb(r) from pricing_rules r where r.id = v_new_id)
    );
  end loop;
end;
$$;
