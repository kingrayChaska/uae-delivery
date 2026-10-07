-- Run after database/test/run.sh, from the repository root:
--   su postgres -c "psql -d uae_delivery_test -f database/test/merchant-pricing.sql"
--
-- Migration 0033 (merchant flat rate AED 15). Recreates the state it was
-- written for — an active merchant Next-Day rule at AED 10 (migration
-- 0022's starting value) with a merchant shipment already booked under it,
-- plus a manager-customised Same-Day rule — applies 0033 again, and checks:
-- both merchant services are now a flat AED 15 with the rule's other
-- settings kept, the old booking still points at its AED 10 rule, the
-- database's own price check accepts AED 15 and refuses AED 10 for a
-- merchant, individual pricing is untouched, and applying 0033 once more
-- changes nothing. Each check raises "FAIL ..." on a wrong answer.

\set ON_ERROR_STOP 1

create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;
grant execute on function t_check(text, text, text) to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'merchant@test.com', '{"full_name":"Merchant M","phone":"0501010101"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'person@test.com', '{"full_name":"Person P","phone":"0502020202"}');
-- Test setup only: no session may change account_type.
alter table profiles disable trigger user;
update profiles set account_type = 'merchant' where id = '00000000-0000-0000-0000-0000000000e1';
alter table profiles enable trigger user;

create temp table individual_before as
select id, delivery_type, base_price, additional_price_per_km, max_distance_km from pricing_rules where account_type = 'individual';

-- ── The state 0033 was written for ───────────────────────────────────────
insert into pricing_rules (name, delivery_type, account_type, base_distance_km, base_price, additional_price_per_km,
  included_weight_kg, additional_price_per_kg, cod_fee, max_distance_km, currency, is_active)
values
  ('Merchant Next-Day Flat', 'next_day', 'merchant', 50, 10, 0, 20, 1, 0, null, 'AED', true),
  -- A manager's own Same-Day rate: AED 12, 25 kg included, AED 2/kg, a COD fee.
  ('Merchant Same-Day Custom', 'same_day', 'merchant', 50, 12, 0, 25, 2, 3, null, 'AED', true);

select id as legacy_rule from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'next_day' \gset

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000e1';
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'Jebel Ali Freezone', 25.0, 55.1, 'Shop M', '04 111 2222', '30B Street', 25.1, 55.2, 'Ahmed', '0501234567',
  30, 40, :'legacy_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'card', 'parcel')
returning id as legacy_shipment \gset
reset role;

-- ── Apply 0033 ───────────────────────────────────────────────────────────
select count(*) as audit_before from audit_logs where action = 'pricing.create_and_activate' and actor_id is null \gset
\ir ../migrations/0033_merchant_flat_rate_aed_15.sql

select t_check('merchant Next-Day active rule is AED 15',
  (select base_price::text from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'next_day'), '15.00');
select t_check('merchant Same-Day active rule is AED 15',
  (select base_price::text from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'same_day'), '15.00');
select t_check('both are flat (no per-km charge)',
  (select string_agg(additional_price_per_km::text, ',' order by delivery_type) from pricing_rules where is_active and account_type = 'merchant'), '0.00,0.00');
select t_check('the manager''s other Same-Day settings are kept (weight, per kg, COD fee)',
  (select concat_ws('/', included_weight_kg, additional_price_per_kg, cod_fee) from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'same_day'),
  '25.00/2.00/3.00');
select t_check('merchant rules stay unlimited in distance',
  (select count(*)::text from pricing_rules where is_active and account_type = 'merchant' and max_distance_km is null), '2');
select t_check('the AED 10 rule is kept, inactive (history)',
  (select is_active::text from pricing_rules where id = :'legacy_rule'), 'false');
select t_check('the booking made at AED 10 is unchanged',
  (select concat_ws('/', price, pricing_rule_id = :'legacy_rule') from shipments where id = :'legacy_shipment'), '10.00/t');
select t_check('individual rules untouched',
  (select count(*)::text from individual_before b join pricing_rules r using (id)
   where r.base_price = b.base_price and r.additional_price_per_km = b.additional_price_per_km
     and r.max_distance_km is not distinct from b.max_distance_km),
  (select count(*)::text from individual_before));
select t_check('no new individual rule',
  (select count(*)::text from pricing_rules where account_type = 'individual'), (select count(*)::text from individual_before));
select t_check('each change is in the audit log',
  (select count(*)::text from audit_logs where action = 'pricing.create_and_activate' and entity_type = 'pricing_rule' and actor_id is null),
  (:audit_before + 2)::text);

select id as next_rule from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'next_day' \gset
select id as same_rule from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'same_day' \gset
select id as person_rule from pricing_rules where is_active and account_type = 'individual' and delivery_type = 'same_day' \gset

-- ── The database's own price check, with the caller's real account type ──
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000e1';

\echo 'LEGITIMATE: merchant books Next-Day at AED 15'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type,
  recipient_payment_type, cod_amount)
values (auth.uid(), 'Jebel Ali Freezone', 25.0, 55.1, 'Shop M', '04 111 2222', 'Al Khayal', 25.1, 55.2, 'Sara', '0559876543',
  45, 50, :'next_rule', 'next_day', 2, 15, 0, 0, 0, 15, 'AED', 'cod', 'parcel', 'postpaid', 233)
returning price, cod_amount;

\echo 'LEGITIMATE: merchant books Same-Day at AED 15 (+ its AED 3 COD fee: 18)'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type,
  recipient_payment_type, cod_amount)
values (auth.uid(), 'Jebel Ali Freezone', 25.0, 55.1, 'Shop M', '04 111 2222', 'Al Aweer', 25.1, 55.2, 'Omar', '0551112222',
  12, 20, :'same_rule', 'same_day', 2, 15, 0, 0, 3, 18, 'AED', 'card', 'parcel', 'postpaid', 39)
returning price;

\set ON_ERROR_STOP 0
\echo 'ATTACK: merchant books Next-Day at the old AED 10 against the new rule'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'Jebel Ali Freezone', 25.0, 55.1, 'Shop M', '04 111 2222', 'Hay Al Quoz', 25.1, 55.2, 'Ali', '0507654321',
  20, 30, :'next_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'card', 'parcel');

\echo 'ATTACK: merchant books Next-Day at AED 10 under the retired rule'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'Jebel Ali Freezone', 25.0, 55.1, 'Shop M', '04 111 2222', 'Hay Al Quoz', 25.1, 55.2, 'Ali', '0507654321',
  20, 30, :'legacy_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'card', 'parcel');

\echo 'ATTACK: an individual books with the merchant AED 15 rule'
set request.jwt.uid = '00000000-0000-0000-0000-0000000000e2';
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'Marina', 25.0, 55.1, 'Person P', '0502020202', 'JBR', 25.1, 55.2, 'Friend', '0503030303',
  40, 45, :'next_rule', 'next_day', 2, 15, 0, 0, 0, 15, 'AED', 'card', 'parcel');
\set ON_ERROR_STOP 1

\echo 'LEGITIMATE: an individual still books Same-Day at the individual rate (14.6 km: AED 21.60)'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'Marina', 25.0, 55.1, 'Person P', '0502020202', 'JBR', 25.1, 55.2, 'Friend', '0503030303',
  14.6, 25, :'person_rule', 'same_day', 12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel')
returning price;
reset role;

select t_check('merchant shipments booked after 0033 are AED 15 (+ COD fee where set)',
  (select string_agg(price::text, ',' order by price) from shipments
   where customer_id = '00000000-0000-0000-0000-0000000000e1' and pricing_rule_id in (:'next_rule', :'same_rule')), '15.00,18.00');
select t_check('the COD amount is the goods only, never the fee',
  (select cod_amount::text from shipments where customer_id = '00000000-0000-0000-0000-0000000000e1' and pricing_rule_id = :'next_rule'), '233.00');

-- ── Applying 0033 again changes nothing ──────────────────────────────────
\ir ../migrations/0033_merchant_flat_rate_aed_15.sql
select t_check('re-running 0033: same active merchant rules',
  (select string_agg(id::text, ',' order by delivery_type) from pricing_rules where is_active and account_type = 'merchant'),
  concat_ws(',', :'same_rule', :'next_rule'));
select t_check('re-running 0033: no extra rules or audit entries',
  (select count(*)::text from audit_logs where action = 'pricing.create_and_activate' and actor_id is null),
  (:audit_before + 2)::text);
