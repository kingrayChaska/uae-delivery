-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0040: staff booking a shipment for a
-- customer with no ParcelLink account — who may create one, the guest
-- details it must carry, pricing/distance/duplicate protections, that it
-- reaches dispatch, the driver and delivery, and what stays private.
-- Each check raises "FAIL ..." on a wrong answer.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/guest-bookings.sql"

\set ON_ERROR_STOP 1

create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;

-- Runs p_sql and expects it to fail with a message matching p_like.
create function t_fails(label text, p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not ilike p_like then
      raise exception 'FAIL %: failed with "%", expected "%"', label, sqlerrm, p_like;
    end if;
    raise notice 'ok  %  -> refused: %', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: succeeded but should have been refused', label;
end $$;

grant execute on function t_check(text, text, text), t_fails(text, text, text) to authenticated, anon;

-- Operator (…5e), manager (…5f), a registered customer (…5c), driver (…5a).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000005e', 'op5@test.com',   '{"full_name":"Op Five","phone":"0505550001"}'),
  ('00000000-0000-0000-0000-00000000005f', 'mgr5@test.com',  '{"full_name":"Mgr Five","phone":"0505550002"}'),
  ('00000000-0000-0000-0000-00000000005c', 'cust5@test.com', '{"full_name":"Cara Customer","phone":"0505550003"}'),
  ('00000000-0000-0000-0000-00000000005a', 'drv5@test.com',  '{"full_name":"Dina Driver","phone":"0505550004"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000005e';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000005f';
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-00000000005a';
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000005e', 'EMP-G1'), ('00000000-0000-0000-0000-00000000005f', 'EMP-G2');

-- A guest booking as the booking service inserts it, with overrides.
create function t_insert_guest(p_overrides jsonb default '{}') returns uuid language plpgsql as $$
declare
  v_rule uuid;
  v jsonb;
  v_id uuid;
begin
  select id into v_rule from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual';
  v := jsonb_build_object(
    'customer_id', null, 'booked_by', '00000000-0000-0000-0000-00000000005e',
    'guest_customer_name', 'Wanda WhatsApp', 'guest_customer_phone', '+971 55 909 1234',
    'distance_km', 14.6, 'pricing_rule_id', v_rule, 'client_request_id', '99999999-0000-4000-8000-000000000001',
    'package_description', 'guest-1'
  ) || p_overrides;
  insert into shipments (
    customer_id, booked_by, guest_customer_name, guest_customer_phone, status,
    pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, recipient_payment_type, cod_amount, package_type, package_description, package_weight_kg,
    client_request_id, batch_id
  ) values (
    (v->>'customer_id')::uuid, (v->>'booked_by')::uuid, v->>'guest_customer_name', v->>'guest_customer_phone', 'confirmed',
    'Al Barsha', 25.09, 55.14, 'Shop Front', '04 222 3333',
    'Business Bay', 25.18, 55.27, 'Rami Recipient', '0507770000',
    (v->>'distance_km')::numeric, 25, (v->>'pricing_rule_id')::uuid, 12, 9.60, 0, 0, 21.60,
    'AED', 'cod', 'postpaid', 150, 'parcel', v->>'package_description', 1,
    (v->>'client_request_id')::uuid, (v->>'batch_id')::uuid
  ) returning id into v_id;
  return v_id;
end $$;
grant execute on function t_insert_guest(jsonb) to authenticated, anon;

\echo '── Who can create a guest booking ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000005c';
select t_fails('ATTACK: a customer books with no customer', $$select t_insert_guest('{"booked_by":"00000000-0000-0000-0000-00000000005c"}')$$, '%row-level security%');

set request.jwt.uid = '00000000-0000-0000-0000-00000000005a';
select t_fails('ATTACK: a driver books with no customer', $$select t_insert_guest('{"booked_by":"00000000-0000-0000-0000-00000000005a"}')$$, '%row-level security%');

set request.jwt.uid = '00000000-0000-0000-0000-00000000005e';
select t_fails('ATTACK: operator records someone else as booker', $$select t_insert_guest('{"booked_by":"00000000-0000-0000-0000-00000000005f"}')$$, '%row-level security%');
select t_fails('guest name required', $$select t_insert_guest('{"guest_customer_name":"  "}')$$, '%shipments_customer_or_guest_check%');
select t_fails('guest phone required', $$select t_insert_guest('{"guest_customer_phone":null}')$$, '%shipments_customer_or_guest_check%');
select t_fails('over the individual distance limit (rule)', $$select t_insert_guest('{"distance_km":200, "client_request_id":"99999999-0000-4000-8000-000000000009"}')$$, '%beyond the 90%');
select t_fails('over the individual distance limit (no rule)', $$select t_insert_guest('{"distance_km":200, "pricing_rule_id":null, "client_request_id":"99999999-0000-4000-8000-000000000008"}')$$, '%beyond the 90%');

create temp table guest (id uuid);
grant select, insert on guest to authenticated, anon;
insert into guest select t_insert_guest();
select t_check('LEGITIMATE: operator books a guest shipment', (select count(*)::text from guest), '1');
select t_fails('duplicate submission (same request id)', $$select t_insert_guest()$$, '%shipments_guest_request_unique%');

reset role;
select t_check('guest booking: no customer, booked by the operator',
  (select coalesce(customer_id::text, 'null') || ' ' || booked_by::text || ' ' || guest_customer_name from shipments where id = (select id from guest)),
  'null 00000000-0000-0000-0000-00000000005e Wanda WhatsApp');
select t_check('tracking code generated (8 characters)',
  (select length(tracking_number)::text from shipments where id = (select id from guest)), '8');
select t_check('operators told it is ready for dispatch',
  (select count(*)::text from notifications where type = 'shipment.ready_for_dispatch'
     and profile_id = '00000000-0000-0000-0000-00000000005e'
     and body like (select tracking_number from shipments where id = (select id from guest)) || '%'), '1');
select t_check('no notification without a recipient',
  (select count(*)::text from notifications where profile_id is null), '0');

-- A registered customer's booking still works and may not carry guest details.
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000005e';
select t_fails('registered booking cannot also carry guest details',
  $$select t_insert_guest('{"customer_id":"00000000-0000-0000-0000-00000000005c", "client_request_id":"99999999-0000-4000-8000-000000000002"}')$$,
  '%shipments_customer_or_guest_check%');
select t_check('LEGITIMATE: registered customer booking unchanged',
  (select count(*)::text from (select t_insert_guest('{"customer_id":"00000000-0000-0000-0000-00000000005c", "guest_customer_name":null, "guest_customer_phone":null, "client_request_id":"99999999-0000-4000-8000-000000000003", "package_description":"registered-1"}')) x), '1');
-- The batch ownership trigger (0020) refuses it before the CHECK is reached.
select t_fails('a guest booking cannot join a batch',
  $$select t_insert_guest('{"batch_id":"40000000-0000-0000-0000-000000000001", "client_request_id":"99999999-0000-4000-8000-000000000004"}')$$,
  '%cannot be added to this batch%');

\echo '── Staff lists ──'
select t_check('staff feed lists it as Individual',
  (select account_type::text from staff_shipment_feed where id = (select id from guest)), 'individual');
select t_check('search by guest name', (select string_agg(package_description, ',') from search_staff_shipments('wanda')), 'guest-1');
select t_check('search by guest phone', (select string_agg(package_description, ',') from search_staff_shipments('055 909 1234')), 'guest-1');
select t_check('Individual tab includes guests',
  (select string_agg(package_description, ',' order by package_description) from search_staff_shipments(null, null, null, null, 'individual')),
  'guest-1,registered-1');
select t_check('Merchant tab excludes guests',
  (select count(*)::text from search_staff_shipments(null, null, null, null, 'merchant')), '0');

set request.jwt.uid = '00000000-0000-0000-0000-00000000005c';
select t_check('another customer cannot see the guest booking',
  (select count(*)::text from shipments where id = (select id from guest)), '0');
select t_check('customer gets nothing from staff search',
  (select count(*)::text from search_staff_shipments('wanda')), '0');

\echo '── Dispatch and delivery ──'
set request.jwt.uid = '00000000-0000-0000-0000-00000000005e';
update shipments set driver_id = '00000000-0000-0000-0000-00000000005a', status = 'assigned' where id = (select id from guest);
reset role;
select t_check('COD record created for the driver, no customer',
  (select status || ' ' || amount || ' ' || coalesce(customer_id::text, 'null') from cod_transactions where shipment_id = (select id from guest)),
  'expected 171.60 null');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000005a';
select t_check('driver sees the assigned guest shipment', (select count(*)::text from shipments where id = (select id from guest)), '1');
update shipments set status = 'driver_accepted' where id = (select id from guest);
update shipments set status = 'arrived_pickup' where id = (select id from guest);
update shipments set status = 'picked_up' where id = (select id from guest);
update shipments set status = 'in_transit' where id = (select id from guest);
update shipments set status = 'arrived_destination' where id = (select id from guest);
select t_check('LEGITIMATE: driver workflow on a guest shipment', (select status::text from shipments where id = (select id from guest)), 'arrived_destination');
select t_fails('no OTP for a customer without an account',
  format('select issue_delivery_otp(%L)', (select id from guest)), '%no ParcelLink account%');

reset role;
insert into storage.objects (bucket_id, name) values ('proof-of-delivery', (select id from guest)::text || '/photo.jpg');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000005a';
select t_check('LEGITIMATE: driver delivers with photo proof',
  complete_delivery((select id from guest), null, (select id from guest)::text || '/photo.jpg', null, null, null, 'Handed to Rami', true),
  'delivered');
reset role;
select t_check('cash recorded as collected, with the amount confirmed',
  (select status || ' ' || collected_amount || ' ' || collected_by from cod_transactions where shipment_id = (select id from guest)),
  'collected 171.60 00000000-0000-0000-0000-00000000005a');
select t_check('still no notification without a recipient', (select count(*)::text from notifications where profile_id is null), '0');

\echo '── Public tracking ──'
select set_config('t.code', (select tracking_number from shipments where id = (select id from guest)), false);
set role anon;
select t_check('public tracking finds the guest shipment',
  (select status::text from get_shipment_tracking(current_setting('t.code'))), 'delivered');
select t_check('public tracking exposes no names or phones',
  (select string_agg(attname, ',' order by attnum) from pg_attribute
   where attrelid = 'public_tracking_result'::regtype::oid and attnum > 0 and not attisdropped
     and (attname like '%name%' or attname like '%phone%' or attname like '%customer%' or attname like '%address%')),
  null);
select t_fails('ATTACK: anonymous read of the shipment row', format('select 1 from shipments where id = %L', (select id from guest)), '%permission denied%');
reset role;

\echo 'guest-bookings: all checks passed'
