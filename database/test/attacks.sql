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
  distance_km, duration_minutes, pricing_rule_id, price, currency, payment_method, package_type
) values (
  '00000000-0000-0000-0000-000000000001', 'Dubai Marina', 25.09, 55.14, 'Cust One', '0501111111',
  'JBR', 25.08, 55.13, 'Recipient', '0509999999',
  14.6, 25, (select id from pricing_rules where is_active), 21.60, 'AED', 'card', 'parcel'
) returning tracking_number, status, price \gset booked_

\echo 'ATTACK: customer books the same trip with price = 1'
insert into shipments (
  customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, price, currency, payment_method, package_type
) values (
  '00000000-0000-0000-0000-000000000001', 'Dubai Marina', 25.09, 55.14, 'Cust One', '0501111111',
  'JBR', 25.08, 55.13, 'Recipient', '0509999999',
  14.6, 25, (select id from pricing_rules where is_active), 1.00, 'AED', 'card', 'parcel'
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
select id as p10_old_rule from pricing_rules where is_active \gset
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
  distance_km, duration_minutes, pricing_rule_id, price, currency, payment_method, package_type)
values (auth.uid(), 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20, :'p10_old_rule', 17, 'AED', 'card', 'parcel');

\echo 'ATTACK: customer1 tags a shipment with a business they do not belong to'
insert into shipments (customer_id, business_account_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, price, currency, payment_method, package_type)
values (auth.uid(), :'p10_biz', 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20,
  (select id from pricing_rules where is_active), 30, 'AED', 'card', 'parcel');

\echo 'LEGITIMATE: customer2 (member) books under their business at the current rate'
set request.jwt.uid = '00000000-0000-0000-0000-000000000002';
insert into shipments (customer_id, business_account_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, price, currency, payment_method, package_type)
values (auth.uid(), :'p10_biz', 'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 10, 20,
  (select id from pricing_rules where is_active), 30, 'AED', 'card', 'parcel');

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
  'A', 25, 55, 'x', 'x', 'B', 25, 55, 'y', 'y', 5, 10, (select id from pricing_rules where is_active), 12, 'AED', 'cod', 'parcel'
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

reset role;
\echo 'Attack battery finished — see README for how to read the results.'
