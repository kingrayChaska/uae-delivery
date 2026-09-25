#!/usr/bin/env bash
# Prices 5,000 random bookings (random distances, random rules with awkward
# decimals) with the app's real calculatePrice(), then asks the database's
# real shipment_price_is_valid() to re-check each one. Any disagreement
# means real customers' bookings would be rejected. Needs the e2e database
# (bash e2e/stack/setup-db.sh). Prints e.g. "5000 cases: 5000 accepted ...".
set -euo pipefail
cd "$(dirname "$0")/../.."
sed "s#/home/claude/uae-delivery#$(pwd)#" database/test/price-consistency-cases.mts > /tmp/price-cases.mts
node --experimental-strip-types --no-warnings /tmp/price-cases.mts > /tmp/price-cases.tsv
su postgres -c "psql -d uae_e2e -q" << 'SQL'
create temp table cases (i int, base_km numeric(6,2), base_price numeric(10,2), per_km numeric(10,2), distance_km numeric(7,2), price numeric(10,2));
\copy cases from '/tmp/price-cases.tsv'
create temp table verdicts (i int, ok boolean);
do $$
declare c record; v_rule uuid;
begin
  for c in select * from cases loop
    insert into pricing_rules (name, base_distance_km, base_price, additional_price_per_km, currency, is_active)
    values ('case', c.base_km, c.base_price, c.per_km, 'AED', true) returning id into v_rule;
    insert into verdicts values (c.i, shipment_price_is_valid(c.distance_km, v_rule, c.price, 'AED'));
  end loop;
end $$;
select format('%s cases: %s accepted by the database, %s rejected', count(*), count(*) filter (where ok), count(*) filter (where not ok)) from verdicts;
SQL
