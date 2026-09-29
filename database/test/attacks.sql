-- Run after database/test/run.sh. Each block is labelled with what SHOULD
-- happen; an ERROR on a block marked "ATTACK" is success (it was blocked),
-- an ERROR on a block marked "LEGITIMATE" is a real bug.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'customer1@test.com', '{"full_name":"Cust One","phone":"0501111111"}'),
  ('00000000-0000-0000-0000-000000000002', 'customer2@test.com', '{"full_name":"Cust Two","phone":"0502222222"}'),
  ('00000000-0000-0000-0000-000000000003', 'driver1@test.com', '{"full_name":"Driver One","phone":"0503333333"}'),
  ('00000000-0000-0000-0000-000000000004', 'manager1@test.com', '{"full_name":"Manager One","phone":"0504444444"}'),
  ('00000000-0000-0000-0000-000000000005', 'operator1@test.com', '{"full_name":"Operator One","phone":"0505555555"}'),
  ('00000000-0000-0000-0000-000000000006', 'driver2@test.com', '{"full_name":"Driver Two","phone":"0506666666"}');

update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006');
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000004';
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-000000000005';
insert into driver_profiles (profile_id, driver_code, license_number) values
  ('00000000-0000-0000-0000-000000000003', 'DRV-001', 'LIC-001'),
  ('00000000-0000-0000-0000-000000000006', 'DRV-002', 'LIC-002');
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-000000000004', 'EMP-001'),
  ('00000000-0000-0000-0000-000000000005', 'EMP-002');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000001'; -- customer1

\echo 'ATTACK: customer self-promotes to manager'
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000001';

\echo 'expect 0 rows: customer cannot read another customer profile'
select id from profiles where id = '00000000-0000-0000-0000-000000000002';

\echo 'LEGITIMATE: customer books a shipment with the correct server-computed price for 14.6km (AED 21.60)'
insert into shipments (
  customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type
) values (
  '00000000-0000-0000-0000-000000000001', 'Dubai Marina', 25.09, 55.14, 'Cust One', '0501111111',
  'JBR', 25.08, 55.13, 'Recipient', '0509999999',
  14.6, 25, (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'), 12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel'
) returning tracking_number, status, price \gset booked_

\echo 'ATTACK: customer books the same trip with price = 1'
insert into shipments (
  customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type
) values (
  '00000000-0000-0000-0000-000000000001', 'Dubai Marina', 25.09, 55.14, 'Cust One', '0501111111',
  'JBR', 25.08, 55.13, 'Recipient', '0509999999',
  14.6, 25, (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'), 12, 9.60, 0, 0, 1.00, 'AED', 'card', 'parcel'
);

\echo 'ATTACK: customer jumps the booked shipment straight to delivered'
update shipments set status = 'delivered' where tracking_number = :'booked_tracking_number';

\echo 'LEGITIMATE: customer cancels their own pending shipment'
update shipments set status = 'cancelled' where tracking_number = :'booked_tracking_number' returning status;

\echo 'ATTACK: customer reads audit_logs'
select count(*) from audit_logs;

\echo 'ATTACK: customer inserts a payment row directly'
insert into payments (shipment_id, customer_id, amount, method)
select id, '00000000-0000-0000-0000-000000000001', 5.00, 'card' from shipments where tracking_number = :'booked_tracking_number';

set request.jwt.uid = '00000000-0000-0000-0000-000000000005'; -- operator1

\echo 'LEGITIMATE: operator sees every shipment (dispatch view)'
select count(*) from shipments;

\echo 'ATTACK: operator changes pricing'
update pricing_rules set base_price = 1 where is_active;

\echo 'ATTACK: operator registers a vehicle (manager-only)'
insert into vehicles (vehicle_type, make, model, plate_number, registration_number)
values ('van', 'Toyota', 'Hiace', 'TEST-PLATE', 'REG-TEST');

set request.jwt.uid = '00000000-0000-0000-0000-000000000001'; -- back to customer1

\echo 'LEGITIMATE: customer1 uploads a package photo to their own storage folder'
insert into storage.objects (bucket_id, name, owner)
values ('package-images', '00000000-0000-0000-0000-000000000001/photo.jpg', auth.uid());

\echo 'ATTACK: customer1 uploads into customer2''s storage folder'
insert into storage.objects (bucket_id, name, owner)
values ('package-images', '00000000-0000-0000-0000-000000000002/evil.jpg', auth.uid());

set request.jwt.uid = '00000000-0000-0000-0000-000000000002'; -- customer2
\echo 'expect 0 rows: customer2 cannot read customer1''s package photo'
select name from storage.objects where name = '00000000-0000-0000-0000-000000000001/photo.jpg';

-- ── Phase 8: driver decline + proof-of-delivery storage ────────────────────
set request.jwt.uid = '00000000-0000-0000-0000-000000000004'; -- manager1
insert into shipments (
  customer_id, driver_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, price, currency, payment_method, package_type
) values (
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'assigned',
  'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 5, 10, 12, 'AED', 'cod', 'parcel'
) returning id \gset decline_

\echo 'ATTACK: operator1 (not the assigned driver) tries to decline driver1''s shipment'
set request.jwt.uid = '00000000-0000-0000-0000-000000000005';
select decline_shipment_assignment(:'decline_id');

\echo 'LEGITIMATE: driver1 declines their own assigned shipment'
set request.jwt.uid = '00000000-0000-0000-0000-000000000003';
select decline_shipment_assignment(:'decline_id');

set request.jwt.uid = '00000000-0000-0000-0000-000000000004';
update shipments set driver_id = '00000000-0000-0000-0000-000000000003', status = 'assigned' where id = :'decline_id';

\echo 'LEGITIMATE: assigned driver uploads proof-of-delivery evidence'
set request.jwt.uid = '00000000-0000-0000-0000-000000000003';
insert into storage.objects (bucket_id, name, owner) values ('proof-of-delivery', :'decline_id' || '/photo.jpg', auth.uid());

\echo 'ATTACK: an unrelated driver uploads POD evidence for someone else''s shipment'
set request.jwt.uid = '00000000-0000-0000-0000-000000000006';
insert into storage.objects (bucket_id, name, owner) values ('proof-of-delivery', :'decline_id' || '/fake.jpg', auth.uid());

-- ── Phase 9: per-role update guard, secrets table, DB-side delivery ──────
set request.jwt.uid = '00000000-0000-0000-0000-000000000005'; -- operator1
insert into shipments (
  customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, price, currency, payment_method, package_type
) values (
  '00000000-0000-0000-0000-000000000001', 'confirmed',
  'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 5, 10, 12, 'AED', 'cod', 'parcel'
) returning id \gset p9_

\echo 'ATTACK: customer1 self-assigns a driver to their own shipment'
set request.jwt.uid = '00000000-0000-0000-0000-000000000001';
update shipments set driver_id = '00000000-0000-0000-0000-000000000003', status = 'assigned' where id = :'p9_id';

\echo 'ATTACK: customer1 edits the drop-off address after booking'
update shipments set dropoff_address = 'elsewhere' where id = :'p9_id';

\echo 'LEGITIMATE: operator1 assigns driver1'
set request.jwt.uid = '00000000-0000-0000-0000-000000000005';
update shipments set driver_id = '00000000-0000-0000-0000-000000000003', status = 'assigned' where id = :'p9_id';

\echo 'ATTACK: driver1 moves the shipment onto another driver'
set request.jwt.uid = '00000000-0000-0000-0000-000000000003';
update shipments set driver_id = '00000000-0000-0000-0000-000000000006' where id = :'p9_id';

\echo 'LEGITIMATE: driver1 walks it to arrived_destination'
update shipments set status = 'driver_accepted' where id = :'p9_id';
update shipments set status = 'arrived_pickup' where id = :'p9_id';
update shipments set status = 'picked_up' where id = :'p9_id';
update shipments set status = 'in_transit' where id = :'p9_id';
update shipments set status = 'arrived_destination' where id = :'p9_id';

\echo 'ATTACK: driver1 sets delivered directly, skipping proof'
update shipments set status = 'delivered' where id = :'p9_id';

\echo 'expect 0: driver1 cannot read shipment_secrets (QR token / OTP)'
select count(*) from shipment_secrets;

\echo 'ATTACK: driver1 inserts a fake OTP-verified proof_of_delivery row'
insert into proof_of_delivery (shipment_id, driver_id, recipient_name, recipient_otp_verified)
values (:'p9_id', auth.uid(), 'x', true);

\echo 'ATTACK: complete_delivery with no proof'
select complete_delivery(:'p9_id', 'Recipient');

\echo 'ATTACK: complete_delivery citing a photo that was never uploaded'
select complete_delivery(:'p9_id', 'Recipient', :'p9_id' || '/ghost.jpg');

\echo 'LEGITIMATE: driver1 issues an OTP to the customer'
select issue_delivery_otp(:'p9_id');

\echo 'expect invalid_otp: wrong code'
select complete_delivery(:'p9_id', 'Recipient', null, null, 'wrong');

reset role;
-- OTPs are stored hashed (0018), so read the code the way a real customer
-- would: from the notification they were sent.
select substring(body from '(\d{4})$') as p9_otp from notifications
where type = 'delivery.otp' and body like '%' || (select tracking_number from shipments where id = :'p9_id') || '%'
order by created_at desc limit 1 \gset
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000003';

\echo 'expect delivered: correct code'
select complete_delivery(:'p9_id', 'Recipient', null, null, :'p9_otp');

\echo 'ATTACK: operator1 inserts an audit log row directly'
set request.jwt.uid = '00000000-0000-0000-0000-000000000005';
insert into audit_logs (actor_id, action, entity_type) values (auth.uid(), 'forged', 'shipment');

-- ── Phase 10: stale pricing, business membership, manager role lock ─────
reset role;
select id as p10_old_rule from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual' \gset
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000004'; -- manager1
insert into pricing_rules (name, base_distance_km, base_price, additional_price_per_km, currency, is_active)
values ('Premium', 5, 20, 2, 'AED', true);
insert into business_accounts (company_name, contact_person, contact_email, contact_phone)
values ('Acme', 'A', 'a@acme.test', '050') returning id as p10_biz \gset
insert into business_account_members (business_account_id, profile_id)
values (:'p10_biz', '00000000-0000-0000-0000-000000000002');

set request.jwt.uid = '00000000-0000-0000-0000-000000000001'; -- customer1
\echo 'ATTACK: customer1 books at the retired (cheaper) pricing rule'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20, :'p10_old_rule', 12, 5, 0, 0, 17, 'AED', 'card', 'parcel');

\echo 'ATTACK: customer1 tags a shipment with a business they do not belong to'
insert into shipments (customer_id, business_account_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), :'p10_biz', 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20,
  (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'), 20, 10, 0, 0, 30, 'AED', 'card', 'parcel');

\echo 'LEGITIMATE: customer2 (member) books under their business at the current rate'
set request.jwt.uid = '00000000-0000-0000-0000-000000000002';
insert into shipments (customer_id, business_account_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), :'p10_biz', 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20,
  (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'), 20, 10, 0, 0, 30, 'AED', 'card', 'parcel');

\echo 'ATTACK: manager1 promotes customer1 to manager'
set request.jwt.uid = '00000000-0000-0000-0000-000000000004';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000001';

\echo 'ATTACK: manager1 demotes themselves'
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-000000000004';

\echo 'LEGITIMATE: manager1 deactivates customer2'
update profiles set active = false where id = '00000000-0000-0000-0000-000000000002';

-- ── Phase 11: notification triggers + QR access ─────────────────────────
set request.jwt.uid = '00000000-0000-0000-0000-000000000005'; -- operator1
insert into shipments (
  customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, price, currency, payment_method, package_type
) values (
  '00000000-0000-0000-0000-000000000001', 'confirmed',
  'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 5, 10, (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'), 12, 'AED', 'cod', 'parcel'
) returning id \gset p11_
update shipments set driver_id = '00000000-0000-0000-0000-000000000003', status = 'assigned' where id = :'p11_id';

\echo 'ATTACK: driver1 reads the QR token straight from shipment_secrets'
set request.jwt.uid = '00000000-0000-0000-0000-000000000003';
select count(*) from shipment_secrets;

\echo 'LEGITIMATE: assigned driver1 fetches the QR token via the function'
select get_shipment_qr_token(:'p11_id') is not null as p11_ok;

\echo 'ATTACK: driver2 (unrelated) fetches the QR token'
set request.jwt.uid = '00000000-0000-0000-0000-000000000006';
select get_shipment_qr_token(:'p11_id');

\echo 'ATTACK: driver2 (unrelated) calls verify_shipment_qr for a shipment they are not assigned to'
select verify_shipment_qr(:'p11_id', 'guess');

reset role;
select qr_token as p11_tok from shipment_secrets where shipment_id = :'p11_id' \gset

\echo 'expect false: driver1 verifies the wrong QR token'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000003';
select verify_shipment_qr(:'p11_id', 'wrong-token');

\echo 'expect true: driver1 verifies the correct QR token (no state change)'
select verify_shipment_qr(:'p11_id', :'p11_tok');

reset role;
\echo 'sanity: every step of the driver workflow produced a customer/operator/driver notification'
select count(*) from notifications where type in
  ('shipment.booked', 'shipment.ready_for_dispatch', 'shipment.assigned');

-- ── Phase 12: function privileges, tracking numbers, OTP hashing, rate limit ─
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000001'; -- customer1
\echo 'ATTACK: customer1 calls notify_operators() to send a phishing message to all staff'
select notify_operators('shipment.delivery_failed', 'URGENT', 'Log in at evil.example');

\echo 'ATTACK: customer1 calls check_rate_limit() to tamper with rate-limit counters'
select check_rate_limit('login:ip:1.2.3.4', 1000000, 1);

reset role;
\echo 'expect 0: no stored OTP is plaintext (all are bcrypt hashes or null)'
select count(*) from shipment_secrets where delivery_otp is not null and delivery_otp not like '$2%';

\echo 'expect 0: tracking numbers created from now on are not sequential'
select count(*) from shipments
where created_at > now() - interval '1 hour'
  and tracking_number ~ '^DLV-\d{8}-\d{6}$';

\echo 'LEGITIMATE: service role can use the rate limiter; 3rd call over a limit of 2 is refused'
set role service_role;
select check_rate_limit('test:key', 2, 60) as first, check_rate_limit('test:key', 2, 60) as second;
\echo 'expect false:'
select check_rate_limit('test:key', 2, 60) as third;

-- ── Phase 13: duplicate submission (migration 0019) ─────────────────────
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000005'; -- operator1 (staff: skips price check)
\echo 'LEGITIMATE: first booking with a client_request_id'
insert into shipments (customer_id, client_request_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone, distance_km, duration_minutes, price, currency, payment_method, package_type)
values ('00000000-0000-0000-0000-000000000001', '11111111-1111-4111-8111-111111111111', 'confirmed',
  'A', 25, 55, 'x', 'x', 'B', 25.1, 55.1, 'y', 'y', 5, 10, 12, 'AED', 'cod', 'parcel');

\echo 'ATTACK: double-submit — second booking with the same client_request_id'
insert into shipments (customer_id, client_request_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone, distance_km, duration_minutes, price, currency, payment_method, package_type)
values ('00000000-0000-0000-0000-000000000001', '11111111-1111-4111-8111-111111111111', 'confirmed',
  'A', 25, 55, 'x', 'x', 'B', 25.1, 55.1, 'y', 'y', 5, 10, 12, 'AED', 'cod', 'parcel');

\echo 'LEGITIMATE: a different customer may reuse the same request id value'
insert into shipments (customer_id, client_request_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone, distance_km, duration_minutes, price, currency, payment_method, package_type)
values ('00000000-0000-0000-0000-000000000002', '11111111-1111-4111-8111-111111111111', 'confirmed',
  'A', 25, 55, 'x', 'x', 'B', 25.1, 55.1, 'y', 'y', 5, 10, 12, 'AED', 'cod', 'parcel');

-- ── Migration 0022: merchants, delivery types, weight/COD pricing, distance
-- limit, product COD and short tracking codes ───────────────────────────
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000007', 'customer3@test.com', '{"full_name":"Cust Three","phone":"0507777777"}');
select id as v2_nd from pricing_rules where is_active and delivery_type = 'next_day' and account_type = 'individual' \gset
select id as v2_sd from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual' \gset
select id as v2_msd from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'merchant' \gset

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000001'; -- customer1

\echo 'ATTACK: customer1 makes themselves a merchant directly'
update profiles set account_type = 'merchant' where id = auth.uid();

\echo 'LEGITIMATE: customer1 records that they chose the individual account type'
update profiles set account_type_selected_at = now() where id = auth.uid();

\echo 'expect 0: an individual cannot read merchant pricing rules'
select count(*) from pricing_rules where account_type = 'merchant';

\echo 'ATTACK: customer1 books at merchant flat-rate pricing while an individual'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 30, 40, :'v2_msd', 'same_day', 5, 15, 0, 0, 0, 15, 'AED', 'card', 'parcel');

\echo 'ATTACK: customer1 submits a merchant application that is already approved'
insert into merchant_applications (profile_id, status, company_name, registration_number, license_number, company_address, country, city,
  company_phone, business_email, contact_name, contact_position, contact_phone, contact_email, business_category, monthly_shipment_volume, pickup_address)
values (auth.uid(), 'approved', 'Cust Co', 'REG-1', 'LIC-1', 'Business Bay, Dubai', 'United Arab Emirates', 'Dubai',
  '0501111111', 'ops@custco.test', 'Cust One', 'Owner', '0501111111', 'c1@test.com', 'Retail', '51-200', 'Warehouse 4, Al Quoz');

\echo 'LEGITIMATE: customer1 submits a merchant application'
insert into merchant_applications (profile_id, company_name, registration_number, license_number, company_address, country, city,
  company_phone, business_email, contact_name, contact_position, contact_phone, contact_email, business_category, monthly_shipment_volume, pickup_address)
values (auth.uid(), 'Cust Co', 'REG-1', 'LIC-1', 'Business Bay, Dubai', 'United Arab Emirates', 'Dubai',
  '0501111111', 'ops@custco.test', 'Cust One', 'Owner', '0501111111', 'c1@test.com', 'Retail', '51-200', 'Warehouse 4, Al Quoz')
returning id as v2_app \gset

\echo 'LEGITIMATE: customer1 uploads their trade licence into their own folder'
insert into storage.objects (bucket_id, name, owner)
values ('merchant-documents', '00000000-0000-0000-0000-000000000001/licence.pdf', auth.uid());

\echo 'ATTACK: customer1 uploads a document into customer3''s folder'
insert into storage.objects (bucket_id, name, owner)
values ('merchant-documents', '00000000-0000-0000-0000-000000000007/licence.pdf', auth.uid());

\echo 'expect 0: customer3 cannot read customer1''s trade licence'
set request.jwt.uid = '00000000-0000-0000-0000-000000000007';
select count(*) from storage.objects where bucket_id = 'merchant-documents';

\echo 'ATTACK: customer3 applies pointing at customer1''s licence file'
insert into merchant_applications (profile_id, trade_license_path, company_name, registration_number, license_number, company_address, country, city,
  company_phone, business_email, contact_name, contact_position, contact_phone, contact_email, business_category, monthly_shipment_volume, pickup_address)
values (auth.uid(), '00000000-0000-0000-0000-000000000001/licence.pdf', 'Three Co', 'REG-3', 'LIC-3', 'Deira, Dubai', 'United Arab Emirates', 'Dubai',
  '0507777777', 'ops@three.test', 'Cust Three', 'Owner', '0507777777', 'c3@test.com', 'Retail', '1-50', 'Deira Warehouse');

\echo 'LEGITIMATE: a manager can read the licence to review the application'
set request.jwt.uid = '00000000-0000-0000-0000-000000000004';
select count(*) from storage.objects where bucket_id = 'merchant-documents';
set request.jwt.uid = '00000000-0000-0000-0000-000000000001';

\echo 'ATTACK: customer1 approves their own application'
update merchant_applications set status = 'approved' where id = :'v2_app';

\echo 'ATTACK: customer1 edits their application while it is pending review'
update merchant_applications set company_name = 'Edited Co' where id = :'v2_app';

\echo 'ATTACK: customer1 calls the manager review function'
select review_merchant_application(:'v2_app', 'approved', null);

\echo 'expect 0: operator cannot read merchant company details'
set request.jwt.uid = '00000000-0000-0000-0000-000000000005';
select count(*) from merchant_applications;

set request.jwt.uid = '00000000-0000-0000-0000-000000000004'; -- manager1
\echo 'ATTACK: manager sends the application back without giving a reason'
select review_merchant_application(:'v2_app', 'requires_changes', '  ');

\echo 'LEGITIMATE: manager requests changes with a reason'
select review_merchant_application(:'v2_app', 'requires_changes', 'Upload a valid trade licence number');

\echo 'LEGITIMATE: customer1 fixes and resubmits'
set request.jwt.uid = '00000000-0000-0000-0000-000000000001';
update merchant_applications set license_number = 'LIC-2', status = 'pending' where id = :'v2_app' returning status;

\echo 'ATTACK: customer1 clears the manager note while resubmitting'
update merchant_applications set review_note = null where id = :'v2_app';

\echo 'LEGITIMATE: manager approves'
set request.jwt.uid = '00000000-0000-0000-0000-000000000004';
select review_merchant_application(:'v2_app', 'approved', null);

\echo 'LEGITIMATE: customer1 is now a merchant with its own business account'
set request.jwt.uid = '00000000-0000-0000-0000-000000000001';
select p.account_type, count(m.*) as memberships from profiles p
left join business_account_members m on m.profile_id = p.id
where p.id = auth.uid() group by p.account_type;

\echo 'LEGITIMATE: the applicant was notified in-app of each decision'
select count(*) from notifications where profile_id = auth.uid() and type like 'merchant.%';

\echo 'ATTACK: merchant books without the compulsory weight'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 30, 40, :'v2_msd', 'same_day', 15, 0, 0, 0, 15, 'AED', 'card', 'parcel');

\echo 'ATTACK: merchant books at individual pricing'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20, :'v2_nd', 'next_day', 5, 8, 3.75, 0, 0, 11.75, 'AED', 'card', 'parcel');

\echo 'LEGITIMATE: merchant books 30 km, 25 kg at the flat rate (AED 15 + AED 5 weight)'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 30, 40, :'v2_msd', 'same_day', 25, 15, 0, 5, 0, 20, 'AED', 'card', 'parcel')
returning price;

set request.jwt.uid = '00000000-0000-0000-0000-000000000007'; -- customer3 (individual)

\echo 'ATTACK: customer3 books a 60 km delivery (over the 50 km limit) with an otherwise correct price'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 60, 70, :'v2_sd', 'same_day', 12, 55, 0, 0, 67, 'AED', 'card', 'parcel');

\echo 'ATTACK: customer3 prices a same-day delivery with the cheaper next-day rule'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20, :'v2_nd', 'same_day', 8, 3.75, 0, 0, 11.75, 'AED', 'card', 'parcel');

\echo 'ATTACK: customer3 skips the weight charge for a 25 kg parcel'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20, :'v2_nd', 'next_day', 25, 8, 3.75, 0, 0, 11.75, 'AED', 'card', 'parcel');

\echo 'ATTACK: customer3 marks a shipment postpaid with nothing to collect'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, recipient_payment_type, cod_amount, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20, :'v2_nd', 'next_day', 'postpaid', 0, 8, 3.75, 0, 0, 11.75, 'AED', 'card', 'parcel');

\echo 'ATTACK: customer3 marks a shipment prepaid but asks the driver to collect cash'
insert into shipments (customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, recipient_payment_type, cod_amount, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20, :'v2_nd', 'next_day', 'prepaid', 450, 8, 3.75, 0, 0, 11.75, 'AED', 'card', 'parcel');

\echo 'LEGITIMATE: customer3 books next-day 10 km, 25 kg, postpaid AED 450 (AED 8 + 3.75 + 5 = 16.75), choosing their own tracking number'
insert into shipments (customer_id, tracking_number, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg, recipient_payment_type, cod_amount, product_value,
  base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type)
values (auth.uid(), 'HACKED01', 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20, :'v2_nd', 'next_day', 25, 'postpaid', 450, 450,
  8, 3.75, 5, 0, 16.75, 'AED', 'card', 'parcel')
returning id as v2_cod_id, tracking_number as v2_code \gset

\echo 'expect 0: the database ignored the client-chosen tracking number'
select count(*) from shipments where tracking_number = 'HACKED01';

\echo 'LEGITIMATE: tracking codes are 8 characters with no look-alike symbols'
select count(*) from shipments where id = :'v2_cod_id' and tracking_number ~ '^[2-9A-HJKMNP-Z]{8}$';

\echo 'LEGITIMATE: anonymous tracking finds the shipment by its code in lower case'
set role anon;
select status from get_shipment_tracking(lower(:'v2_code'));
set role authenticated;

\echo 'ATTACK: customer3 rewrites the tracking code'
update shipments set tracking_number = 'ABCDEFGH' where id = :'v2_cod_id';

\echo 'ATTACK: operator books a 70 km delivery on a customer''s behalf (distance limit applies to staff too)'
set request.jwt.uid = '00000000-0000-0000-0000-000000000005';
insert into shipments (customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, price, currency, payment_method, package_type)
values ('00000000-0000-0000-0000-000000000007', 'confirmed', 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 70, 80, :'v2_sd', 'same_day', 77, 'AED', 'cod', 'parcel');

\echo 'LEGITIMATE: assigning a driver creates the expected COD record, split into goods and fee'
reset role;
update shipments set status = 'confirmed' where id = :'v2_cod_id';
set role authenticated;
update shipments set driver_id = '00000000-0000-0000-0000-000000000003', status = 'assigned' where id = :'v2_cod_id';
select amount, product_amount, delivery_fee_amount from cod_transactions where shipment_id = :'v2_cod_id';

\echo 'ATTACK: the driver lowers the goods amount they have to hand over'
set request.jwt.uid = '00000000-0000-0000-0000-000000000003';
update cod_transactions set product_amount = 1, amount = 1 where shipment_id = :'v2_cod_id';

\echo 'LEGITIMATE: the driver marks the COD collected'
update cod_transactions set status = 'collected', collected_at = now() where shipment_id = :'v2_cod_id' returning status;

-- ── Migration 0023: deleting operator and driver accounts ───────────────
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000008', 'driver3@test.com', '{"full_name":"Driver Three","phone":"0508888888"}'),
  ('00000000-0000-0000-0000-000000000009', 'operator2@test.com', '{"full_name":"Operator Two","phone":"0509999999"}');
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-000000000008';
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-000000000009';
insert into driver_profiles (profile_id, driver_code, license_number) values ('00000000-0000-0000-0000-000000000008', 'DRV-003', 'LIC-003');
insert into staff_profiles (profile_id, employee_id) values ('00000000-0000-0000-0000-000000000009', 'EMP-009');
set role authenticated;

\echo 'ATTACK: an operator deletes a driver account'
set request.jwt.uid = '00000000-0000-0000-0000-000000000005';
select delete_staff_account('00000000-0000-0000-0000-000000000008');

\echo 'ATTACK: a customer deletes a driver account'
set request.jwt.uid = '00000000-0000-0000-0000-000000000007';
select delete_staff_account('00000000-0000-0000-0000-000000000008');

set request.jwt.uid = '00000000-0000-0000-0000-000000000004'; -- manager1
\echo 'ATTACK: a manager deletes their own account'
select delete_staff_account('00000000-0000-0000-0000-000000000004');

\echo 'ATTACK: a manager deletes a customer account through the staff path'
select delete_staff_account('00000000-0000-0000-0000-000000000007');

\echo 'ATTACK: a manager deletes driver1, who still has a delivery in progress'
select delete_staff_account('00000000-0000-0000-0000-000000000003');

\echo 'ATTACK: shipments can''t be assigned to a customer profile'
update shipments set driver_id = '00000000-0000-0000-0000-000000000007', status = 'assigned'
where id = (select id from shipments where status = 'confirmed' and driver_id is null limit 1);

\echo 'LEGITIMATE: manager deletes operator2'
select delete_staff_account('00000000-0000-0000-0000-000000000009');

\echo 'LEGITIMATE: manager deletes driver3 (no deliveries in progress)'
select delete_staff_account('00000000-0000-0000-0000-000000000008');

\echo 'LEGITIMATE: the deleted driver is scrubbed, inactive and gone from the fleet, but the profile row remains'
select p.active, p.email like 'deleted-%@deleted.invalid', p.phone = '', p.deleted_at is not null,
  (select count(*) from driver_profiles where profile_id = p.id)
from profiles p where p.id = '00000000-0000-0000-0000-000000000008';

\echo 'ATTACK: a deleted account is deleted again'
select delete_staff_account('00000000-0000-0000-0000-000000000008');

\echo 'ATTACK: a shipment is assigned to the deleted driver'
update shipments set driver_id = '00000000-0000-0000-0000-000000000008', status = 'assigned'
where id = (select id from shipments where status = 'confirmed' and driver_id is null limit 1);

-- ── Migration 0024: deleting users from Supabase Auth (dashboard / admin API)
reset role;

\echo 'LEGITIMATE: deleting driver3 (already deleted in the app) from auth.users succeeds'
delete from auth.users where id = '00000000-0000-0000-0000-000000000008';

\echo 'LEGITIMATE: deleting customer3 from auth.users succeeds despite shipments, notifications and COD history'
delete from auth.users where id = '00000000-0000-0000-0000-000000000007';

\echo 'LEGITIMATE: customer3''s profile remains, anonymised, and their shipments still point at it'
select p.active, p.deleted_at is not null as deleted, p.email like 'deleted-%' as scrubbed,
  (select count(*) from shipments where customer_id = p.id) > 0 as history_kept
from profiles p where p.id = '00000000-0000-0000-0000-000000000007';

\echo 'ATTACK: deleting driver1 from auth.users while they still have a delivery in progress'
delete from auth.users where id = '00000000-0000-0000-0000-000000000003';

\echo 'expect 1: driver1 was not deleted'
select count(*) from auth.users where id = '00000000-0000-0000-0000-000000000003';

\echo 'ATTACK: a client calls the internal anonymize_profile() directly'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000004';
select anonymize_profile('00000000-0000-0000-0000-000000000006', null);

reset role;
\echo 'Attack battery finished — see README for how to read the results.'
