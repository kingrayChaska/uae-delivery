-- Run after database/test/run.sh (a scratch database with every migration
-- applied). Checks migration 0035: search_driver_shipments() (name,
-- shipment ID, pickup/drop-off address, status, UAE booking date,
-- combined) and, above all, that a driver only ever searches the
-- shipments assigned to them. Each check raises "FAIL ..." on a wrong
-- answer; the ATTACK block at the end must end in "permission denied".
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/driver-search.sql"

\set ON_ERROR_STOP 1

create function t_drv(q text, st shipment_status[], f date, t date) returns text language sql as $$
  select coalesce(string_agg(package_description, ',' order by package_description), '-')
  from search_driver_shipments(q, st, f, t)
$$;
create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;

-- Driver A (…1a), driver B (…1b), the booking customer (…1c), an operator (…1d).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000001a', 'driverA@test.com', '{"full_name":"Driver A","phone":"0501110001"}'),
  ('00000000-0000-0000-0000-00000000001b', 'driverB@test.com', '{"full_name":"Driver B","phone":"0501110002"}'),
  ('00000000-0000-0000-0000-00000000001c', 'cust@test.com', '{"full_name":"Customer C","phone":"0501110003"}'),
  ('00000000-0000-0000-0000-00000000001d', 'op@test.com', '{"full_name":"Op","phone":"0501110004"}');
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-00000000001b');
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000001d';
insert into staff_profiles (profile_id, employee_id) values ('00000000-0000-0000-0000-00000000001d', 'EMP-D1');

-- d1-d4 are driver A's, d5 driver B's, d6 not yet assigned (package_description
-- carries the label). Booking times are UAE time: d3 sits just after
-- midnight on 8 Oct, d2 just before.
create temp table seed (n int, drv text, code text, rname text, rphone text, pickup text, dropoff text, building text, st shipment_status, at timestamptz);
insert into seed values
  (1, 'a', 'PXK724AQ', 'Ahmed Hassan', '+971 50 123 4567', 'Dubai Marina Mall',  'Burj Khalifa, Downtown Dubai', null,            'delivered',   '2026-10-08 09:00+04'),
  (2, 'a', 'QWE77RTY', 'Sara Ali',     '050-765-4321',     'Clock Tower, Deira', 'Jumeirah Beach Residence',    null,            'in_transit',  '2026-10-07 23:30+04'),
  (3, 'a', 'ZXC55VBN', 'AHMED KHAN',   '0559876543',       'Al Barsha',          'Business Bay',                'Marina Gate 2', 'assigned',    '2026-10-08 00:10+04'),
  (4, 'a', 'MNB33HJK', 'Omar',         '0551112222',       'Jumeirah 1',         'Dubai Marina',                null,            'returned',    '2026-10-01 12:00+04'),
  (5, 'b', 'PXK724BQ', 'Ahmed Other',  '0501234567',       'Clock Tower, Deira', 'Burj Khalifa',                null,            'delivered',   '2026-10-08 10:00+04'),
  (6, null, 'PXK724CQ', 'Ahmed Free',  '0501234568',       'Clock Tower, Deira', 'Burj Khalifa',                null,            'confirmed',   '2026-10-08 11:00+04');
-- Insert the seed rows as superuser (bypasses RLS; triggers still run on insert).
do $$
declare r record; v_rule uuid; v_id uuid;
begin
  select id into v_rule from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual';
  for r in select * from seed order by n loop
    insert into shipments (
      customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
      dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
      distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type
    ) values (
      '00000000-0000-0000-0000-00000000001c', r.pickup, 25.09, 55.14, 'Shop C', '04 111 2222',
      r.dropoff, 25.08, 55.13, r.rname, r.rphone,
      14.6, 25, v_rule, 12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel'
    ) returning id into v_id;
    -- status, driver and tracking code straight to the target (superuser test setup only)
    alter table shipments disable trigger user;
    update shipments set
      created_at = r.at,
      package_description = 'd' || r.n,
      tracking_number = r.code,
      dropoff_building = r.building,
      status = r.st,
      driver_id = case when r.drv is null then null else ('00000000-0000-0000-0000-00000000001' || r.drv)::uuid end
    where id = v_id;
    alter table shipments enable trigger user;
  end loop;
end $$;
alter table shipments disable trigger user;
update shipments set legacy_tracking_number = 'DLV-20261007-abc123' where package_description = 'd2';
alter table shipments enable trigger user;

grant execute on function t_drv(text, shipment_status[], date, date), t_check(text, text, text) to authenticated, anon;

\echo '── search_driver_shipments: driver A ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000001a';
select t_check('no filters = all of A only',          t_drv(null, null, null, null), 'd1,d2,d3,d4');
select t_check('blank search = no search',            t_drv('   ', null, null, null), 'd1,d2,d3,d4');
-- Name
select t_check('name full',                           t_drv('Ahmed Hassan', null, null, null), 'd1');
select t_check('name partial',                        t_drv('Ahm', null, null, null), 'd1,d3');
select t_check('name other case',                     t_drv('ahmed khan', null, null, null), 'd3');
select t_check('name no match',                       t_drv('Zainab', null, null, null), '-');
select t_check('sender name (Shop C)',                t_drv('shop c', null, null, null), 'd1,d2,d3,d4');
-- Shipment ID
select t_check('ID exact',                            t_drv('PXK724AQ', null, null, null), 'd1');
select t_check('ID partial',                          t_drv('PXK724', null, null, null), 'd1');
select t_check('ID other case',                       t_drv('qwe77rty', null, null, null), 'd2');
select t_check('ID legacy',                           t_drv('DLV-20261007', null, null, null), 'd2');
select t_check('ID nonexistent',                      t_drv('NOPE9999', null, null, null), '-');
select t_check('ID wildcard taken literally',         t_drv('PXK%', null, null, null), '-');
-- Address
select t_check('drop-off address',                    t_drv('Burj Khalifa', null, null, null), 'd1');
select t_check('pickup address',                      t_drv('Clock Tower', null, null, null), 'd2');
select t_check('either address (Dubai Marina)',       t_drv('Dubai Marina', null, null, null), 'd1,d4');
select t_check('address partial, other case',         t_drv('jumeirah', null, null, null), 'd2,d4');
select t_check('building typed at booking',           t_drv('marina gate', null, null, null), 'd3');
-- Phone (same rules as the customer search)
select t_check('phone any format',                    t_drv('0501234567', null, null, null), 'd1');
-- Date (UAE booking date)
select t_check('today (08 Oct)',                      t_drv(null, null, '2026-10-08', '2026-10-08'), 'd1,d3');
select t_check('specific date (07 Oct, 23:30 UAE)',   t_drv(null, null, '2026-10-07', '2026-10-07'), 'd2');
select t_check('date range',                          t_drv(null, null, '2026-10-01', '2026-10-07'), 'd2,d4');
select t_check('date with no shipments',              t_drv(null, null, '2026-09-01', '2026-09-30'), '-');
-- Status
select t_check('status delivered',                    t_drv(null, '{delivered}', null, null), 'd1');
select t_check('active group',                        t_drv(null, '{confirmed,assigned,driver_accepted,arrived_pickup,picked_up,in_transit,arrived_destination}', null, null), 'd2,d3');
-- Combined (AND between filter types)
select t_check('name + date',                         t_drv('ahmed', null, '2026-10-08', '2026-10-08'), 'd1,d3');
select t_check('address + date',                      t_drv('Dubai Marina', null, '2026-10-08', '2026-10-08'), 'd1');
select t_check('ID + date',                           t_drv('PXK724AQ', null, '2026-10-08', '2026-10-08'), 'd1');
select t_check('ID + other date',                     t_drv('PXK724AQ', null, '2026-10-07', '2026-10-07'), '-');
select t_check('name + date + status',                t_drv('ahmed', '{assigned}', '2026-10-08', '2026-10-08'), 'd3');
select t_check('combined, no match',                  t_drv('ahmed', '{returned}', '2026-10-08', '2026-10-08'), '-');

\echo '── ownership: no other driver''s shipments, however searched ──'
select t_check('A: B''s ID',                          t_drv('PXK724BQ', null, null, null), '-');
select t_check('A: unassigned shipment''s ID',        t_drv('PXK724CQ', null, null, null), '-');
select t_check('A: B''s recipient name',              t_drv('Other', null, null, null), '-');
select t_check('A: B''s phone',                       t_drv('050 123 4567', null, '2026-10-08', '2026-10-08'), 'd1');
select t_check('A: wildcard-only search',             t_drv('%', null, null, null), '-');
select t_check('A: direct table read of B''s ID (RLS)', (select count(*)::text from shipments where tracking_number = 'PXK724BQ'), '0');
set request.jwt.uid = '00000000-0000-0000-0000-00000000001b';
select t_check('B sees only own',                     t_drv(null, null, null, null), 'd5');
select t_check('B: A''s address',                     t_drv('Dubai Marina', null, null, null), '-');
select t_check('B: A''s ID',                          t_drv('PXK724AQ', null, null, null), '-');
set request.jwt.uid = '00000000-0000-0000-0000-00000000001c';
select t_check('customer: assigned nothing',          t_drv(null, null, null, null), '-');
set request.jwt.uid = '00000000-0000-0000-0000-00000000001d';
select t_check('staff: assigned nothing',             t_drv(null, null, null, null), '-');
reset request.jwt.uid;
select t_check('no session: nothing',                 t_drv(null, null, null, null), '-');
reset role;

\echo '── operator edits reach the driver ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000001d';
\echo 'LEGITIMATE: operator moves d2 in_transit -> arrived_destination and corrects the recipient name'
update shipments set status = 'arrived_destination' where package_description = 'd2' returning status;
update shipments set dropoff_contact_name = 'Sara Ali Mansour' where package_description = 'd2' returning dropoff_contact_name;
set request.jwt.uid = '00000000-0000-0000-0000-00000000001a';
select t_check('driver: old status filter drops it',  t_drv(null, '{in_transit}', null, null), '-');
select t_check('driver: new status filter has it',    t_drv(null, '{arrived_destination}', null, null), 'd2');
select t_check('driver: finds the corrected name',    t_drv('mansour', null, null, null), 'd2');
reset request.jwt.uid;
reset role;

\echo '── reassignment moves the shipment between drivers'' searches ──'
alter table shipments disable trigger user;
update shipments set driver_id = '00000000-0000-0000-0000-00000000001b' where package_description = 'd3';
alter table shipments enable trigger user;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000001a';
select t_check('A no longer finds d3',                t_drv('ahmed khan', null, null, null), '-');
set request.jwt.uid = '00000000-0000-0000-0000-00000000001b';
select t_check('B now finds d3',                      t_drv('ahmed khan', null, null, null), 'd3');
reset request.jwt.uid;
reset role;

\set ON_ERROR_STOP 0
set role anon;
\echo 'ATTACK: anon calls search_driver_shipments (expect permission denied)'
select count(*) from search_driver_shipments(null, null, null, null);
reset role;
