#!/usr/bin/env bash
# Prices 5,000 random bookings (random distances, weights, delivery types,
# prepaid/postpaid, and random rules with awkward decimals) with the app's
# real calculateShipmentPrice(), then asks the database's real
# shipment_price_is_valid() to re-check each one. Any disagreement means real
# customers' bookings would be rejected. Needs the e2e database
# (bash e2e/stack/setup-db.sh). Prints e.g. "5000 cases: 5000 accepted ...".
set -euo pipefail
cd "$(dirname "$0")/../.."
sed "s#/home/claude/uae-delivery#$(pwd)#" database/test/price-consistency-cases.mts > /tmp/price-cases.mts
node --experimental-strip-types --no-warnings /tmp/price-cases.mts > /tmp/price-cases.tsv
su postgres -c "psql -d uae_e2e -q" << 'SQL'
create temp table cases (
  i int, delivery delivery_type, base_km numeric(6,2), base_price numeric(10,2), per_km numeric(10,2),
  incl_kg numeric(8,2), per_kg numeric(10,2), cod_fee numeric(10,2),
  distance_km numeric(7,2), weight_kg numeric(8,2), recipient recipient_payment_type,
  base_charge numeric(10,2), distance_charge numeric(10,2), weight_charge numeric(10,2), cod_charge numeric(10,2), price numeric(10,2)
);
\copy cases from '/tmp/price-cases.tsv'
create temp table verdicts (i int, ok boolean);
do $$
declare c record; v_rule uuid; v_customer uuid;
begin
  select id into v_customer from profiles where account_type = 'individual' limit 1;
  for c in select * from cases loop
    insert into pricing_rules (name, delivery_type, account_type, base_distance_km, base_price, additional_price_per_km,
      included_weight_kg, additional_price_per_kg, cod_fee, max_distance_km, currency, is_active)
    values ('case', c.delivery, 'individual', c.base_km, c.base_price, c.per_km, c.incl_kg, c.per_kg, c.cod_fee, 300, 'AED', true)
    returning id into v_rule;
    insert into verdicts values (c.i, shipment_price_is_valid(
      v_customer, v_rule, c.delivery, c.distance_km, c.weight_kg, c.recipient,
      c.base_charge, c.distance_charge, c.weight_charge, c.cod_charge, c.price, 'AED'));
  end loop;
end $$;
select format('%s cases: %s accepted by the database, %s rejected', count(*), count(*) filter (where ok), count(*) filter (where not ok)) from verdicts;
SQL
