-- Run after database/test/run.sh, from the repository root:
--   su postgres -c "psql -d uae_delivery_test -f database/test/merchant-repricing.sql"
--
-- Migration 0034 (existing merchant shipments to AED 15). Books merchant
-- shipments under an AED 10 Next-Day rule in every state the migration
-- tells apart, applies 0033 then 0034 again, and checks each one: unpaid
-- shipments move to AED 15 with their COD record, pending payment, booked
-- bulk row and invoice following; already-paid ones stay at AED 10; bulk
-- drafts go back to validation; individuals are untouched; a second run
-- changes nothing. Each check raises "FAIL ..." on a wrong answer.

\set ON_ERROR_STOP 1

create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'merchant-r@test.com', '{"full_name":"Merchant R","phone":"0501010101"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'person-r@test.com', '{"full_name":"Person R","phone":"0502020202"}'),
  ('00000000-0000-0000-0000-0000000000f3', 'driver-r@test.com', '{"full_name":"Driver R","phone":"0503030303"}');
alter table profiles disable trigger user;
update profiles set account_type = 'merchant' where id = '00000000-0000-0000-0000-0000000000f1';
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-0000000000f3';
alter table profiles enable trigger user;
insert into driver_profiles (profile_id, driver_code, license_number) values ('00000000-0000-0000-0000-0000000000f3', 'DRV-R', 'LIC-R');

-- The rate the shipments were booked under: Next-Day AED 10 (0022).
insert into pricing_rules (name, delivery_type, account_type, base_distance_km, base_price, additional_price_per_km,
  included_weight_kg, additional_price_per_kg, cod_fee, max_distance_km, currency, is_active)
values ('Merchant Next-Day Flat', 'next_day', 'merchant', 50, 10, 0, 20, 1, 0, null, 'AED', true);
select id as old_rule from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'next_day' \gset
select id as person_rule from pricing_rules where is_active and account_type = 'individual' and delivery_type = 'same_day' \gset

-- ── Merchant bookings at AED 10, through the normal price check ──────────
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000f1';
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type,
  recipient_payment_type, cod_amount, package_description)
values
  (auth.uid(), 'Jebel Ali', 25.0, 55.1, 'Shop R', '04 111 2222', 'A', 25.1, 55.2, 'R1', '0501', 30, 40, :'old_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'card', 'parcel', 'prepaid', 0, 'card-unpaid'),
  (auth.uid(), 'Jebel Ali', 25.0, 55.1, 'Shop R', '04 111 2222', 'B', 25.1, 55.2, 'R2', '0502', 30, 40, :'old_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'cod', 'parcel', 'postpaid', 233, 'cash-assigned'),
  (auth.uid(), 'Jebel Ali', 25.0, 55.1, 'Shop R', '04 111 2222', 'C', 25.1, 55.2, 'R3', '0503', 30, 40, :'old_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'cod', 'parcel', 'postpaid', 39, 'cash-collected'),
  (auth.uid(), 'Jebel Ali', 25.0, 55.1, 'Shop R', '04 111 2222', 'D', 25.1, 55.2, 'R4', '0504', 30, 40, :'old_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'card', 'parcel', 'prepaid', 0, 'card-paid'),
  (auth.uid(), 'Jebel Ali', 25.0, 55.1, 'Shop R', '04 111 2222', 'E', 25.1, 55.2, 'R5', '0505', 30, 40, :'old_rule', 'next_day', 25, 10, 0, 5, 0, 15, 'AED', 'card', 'parcel', 'prepaid', 0, 'heavy-25kg'),
  (auth.uid(), 'Jebel Ali', 25.0, 55.1, 'Shop R', '04 111 2222', 'F', 25.1, 55.2, 'R6', '0506', 30, 40, :'old_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'card', 'parcel', 'prepaid', 0, 'invoiced'),
  (auth.uid(), 'Jebel Ali', 25.0, 55.1, 'Shop R', '04 111 2222', 'G', 25.1, 55.2, 'R7', '0507', 30, 40, :'old_rule', 'next_day', 2, 10, 0, 0, 0, 10, 'AED', 'cod', 'parcel', 'postpaid', 50, 'bulk-booked');
\echo 'issue an invoice at AED 10 for "invoiced"'
select issue_shipment_invoice((select id from shipments where package_description = 'invoiced')) as old_invoice \gset
set request.jwt.uid = '00000000-0000-0000-0000-0000000000f2';
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type, package_description)
values (auth.uid(), 'Marina', 25.0, 55.1, 'Person R', '0502020202', 'JBR', 25.1, 55.2, 'Friend', '0503030303',
  14.6, 25, :'person_rule', 'same_day', 12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel', 'individual');
reset role;

-- ── The states the migration tells apart ─────────────────────────────────
insert into payments (shipment_id, customer_id, amount, method, status)
select id, customer_id, 10, 'card', 'pending' from shipments where package_description = 'card-unpaid';

-- Cash, driver assigned: the COD record is created by the usual trigger.
update shipments set status = 'confirmed' where package_description = 'cash-assigned';
update shipments set driver_id = '00000000-0000-0000-0000-0000000000f3', status = 'assigned' where package_description = 'cash-assigned';

alter table shipments disable trigger user;
-- Cash fee already collected by the driver.
update shipments set status = 'delivered', driver_id = '00000000-0000-0000-0000-0000000000f3' where package_description = 'cash-collected';
-- Card fee already paid.
update shipments set status = 'confirmed', payment_status = 'paid' where package_description = 'card-paid';
-- A booked bulk shipment and a draft still under review.
insert into shipment_batches (id, name, customer_id, created_by, status) values
  ('30000000-0000-0000-0000-0000000000b1', 'Booked', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'submitted'),
  ('30000000-0000-0000-0000-0000000000d1', 'Draft', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'draft');
update shipments set batch_id = '30000000-0000-0000-0000-0000000000b1', client_request_id = '40000000-0000-0000-0000-0000000000b1'
where package_description = 'bulk-booked';
alter table shipments enable trigger user;
insert into cod_transactions (shipment_id, driver_id, customer_id, amount, product_amount, delivery_fee_amount, status, collected_at)
select id, driver_id, customer_id, 49, 39, 10, 'collected', now() from shipments where package_description = 'cash-collected';

insert into shipment_batch_rows (id, batch_id, row_number, input, input_hash, status, quote, delivery_fee) values
  ('40000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 1, '{}', 'h-booked', 'valid',
   jsonb_build_object('booking', jsonb_build_object('ruleId', :'old_rule', 'breakdown', jsonb_build_object('basePrice', 10, 'distanceCharge', 0, 'weightCharge', 0, 'codCharge', 0, 'totalPrice', 10))), 10),
  ('40000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1', 1, '{}', 'h-draft', 'valid',
   jsonb_build_object('booking', jsonb_build_object('ruleId', :'old_rule', 'breakdown', jsonb_build_object('totalPrice', 10))), 10);

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000f1';
\echo 'issue the bulk shipment invoice at AED 10'
select issue_batch_invoice('30000000-0000-0000-0000-0000000000b1') as old_batch_invoice \gset
reset role;

select t_check('setup: the assigned cash shipment has its COD record (AED 10 fee + 233)',
  (select concat_ws('/', c.delivery_fee_amount, c.product_amount, c.amount, c.status) from cod_transactions c join shipments s on s.id = c.shipment_id where s.package_description = 'cash-assigned'),
  '10.00/233.00/243.00/expected');

-- ── 0033 (AED 15 rule active again), then 0034 ───────────────────────────
select count(*) as reprice_audit_before from audit_logs where action = 'shipment.reprice' \gset
\ir ../migrations/0033_merchant_flat_rate_aed_15.sql
\ir ../migrations/0034_reprice_merchant_shipments_aed_15.sql
select id as new_rule from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'next_day' \gset

create function t_price(d text) returns text language sql as $$
  select concat_ws('/', s.price, s.base_charge, s.weight_charge, s.pricing_rule_id = (select id from pricing_rules where is_active and account_type = 'merchant' and delivery_type = 'next_day'))
  from shipments s where s.package_description = d
$$;

select t_check('unpaid card shipment -> AED 15 on the new rule',  t_price('card-unpaid'), '15.00/15.00/0.00/t');
select t_check('its pending card payment follows',
  (select p.amount::text from payments p join shipments s on s.id = p.shipment_id where s.package_description = 'card-unpaid'), '15.00');
select t_check('assigned cash shipment -> AED 15',                t_price('cash-assigned'), '15.00/15.00/0.00/t');
select t_check('its expected COD record: fee 15, goods unchanged, total 248',
  (select concat_ws('/', c.delivery_fee_amount, c.product_amount, c.amount, c.status) from cod_transactions c join shipments s on s.id = c.shipment_id where s.package_description = 'cash-assigned'),
  '15.00/233.00/248.00/expected');
select t_check('25 kg shipment -> AED 15 + its AED 5 weight charge', t_price('heavy-25kg'), '20.00/15.00/5.00/t');
select t_check('cash fee already collected -> stays AED 10',      t_price('cash-collected'), '10.00/10.00/0.00/f');
select t_check('its collected COD record is untouched',
  (select concat_ws('/', c.delivery_fee_amount, c.amount, c.status) from cod_transactions c join shipments s on s.id = c.shipment_id where s.package_description = 'cash-collected'),
  '10.00/49.00/collected');
select t_check('card fee already paid -> stays AED 10',           t_price('card-paid'), '10.00/10.00/0.00/f');
select t_check('the individual shipment is untouched',
  (select concat_ws('/', price, pricing_rule_id = :'person_rule') from shipments where package_description = 'individual'), '21.60/t');

select t_check('the AED 10 invoice is voided, with the reason',
  (select status || '/' || (void_reason like 'Merchant delivery fee corrected to AED 15%')::text from invoices where invoice_number = :'old_invoice'), 'void/true');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000f1';
select issue_shipment_invoice((select id from shipments where package_description = 'invoiced')) as new_invoice \gset
reset role;
select t_check('a new invoice is issued for AED 15',
  (select concat_ws('/', status, total) from invoices where invoice_number = :'new_invoice'), 'issued/15.00');
select t_check('the bulk shipment invoice is voided too',
  (select status from invoices where invoice_number = :'old_batch_invoice'), 'void');

select t_check('booked bulk shipment -> AED 15',                  t_price('bulk-booked'), '15.00/15.00/0.00/t');
select t_check('its bulk row: fee and quote follow',
  (select concat_ws('/', delivery_fee, quote #>> '{booking,breakdown,totalPrice}', quote #>> '{booking,breakdown,basePrice}', (quote #>> '{booking,ruleId}') = :'new_rule')
   from shipment_batch_rows where id = '40000000-0000-0000-0000-0000000000b1'),
  '15.00/15.00/15.00/t');
select t_check('bulk draft row quoted at AED 10 goes back to validation',
  (select concat_ws('/', status, claimed_at is null) from shipment_batch_rows where id = '40000000-0000-0000-0000-0000000000d1'), 'pending/t');

select t_check('every repriced shipment is in the audit log (5)',
  (select (count(*) - :reprice_audit_before)::text from audit_logs where action = 'shipment.reprice'), '5');
select t_check('the price guard is back on',
  (select tgenabled::text from pg_trigger where tgname = 'shipments_prevent_pricing_tampering'), 'O');

\echo 'ATTACK: the merchant changes a price themselves (the guard is back)'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000f1';
\set ON_ERROR_STOP 0
update shipments set price = 1 where package_description = 'card-unpaid';
\set ON_ERROR_STOP 1
reset role;

-- ── Running 0034 again changes nothing ───────────────────────────────────
\ir ../migrations/0034_reprice_merchant_shipments_aed_15.sql
select t_check('second run: no more repricing',
  (select (count(*) - :reprice_audit_before)::text from audit_logs where action = 'shipment.reprice'), '5');
select t_check('second run: the new invoice stays issued',
  (select status from invoices where invoice_number = :'new_invoice'), 'issued');
