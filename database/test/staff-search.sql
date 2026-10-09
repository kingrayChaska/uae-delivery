-- Run after database/test/run.sh (a scratch database with every migration
-- applied). Checks migration 0038: search_staff_shipments() for operators
-- and managers — shipment ID, names, phones, addresses, the customer /
-- company / driver, status, UAE booking date, the list's tabs and one bulk
-- batch, all combined — that only staff get anything from it, and that the
-- text search can use its trigram index. Each check raises "FAIL ..." on a
-- wrong answer; the ATTACK block at the end must end in "permission denied".
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/staff-search.sql"

\set ON_ERROR_STOP 1

create function t_staff(q text, st shipment_status[] default null, f date default null, t date default null,
                        acct account_type default null, bulk boolean default false, batch uuid default null)
returns text language sql as $$
  select coalesce(string_agg(package_description, ',' order by package_description), '-')
  from search_staff_shipments(q, st, f, t, acct, bulk, batch)
$$;
create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;

-- An individual customer (…2a), a merchant (…2b) in the business account
-- "Desert Rose Trading", drivers Karim (…2c) and Other (…2d), an operator
-- (…2e) and a manager (…2f).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000002a', 'ivy@test.com',   '{"full_name":"Ivy Individual","phone":"0502220001"}'),
  ('00000000-0000-0000-0000-00000000002b', 'mona@test.com',  '{"full_name":"Mona Merchant","phone":"0502220002"}'),
  ('00000000-0000-0000-0000-00000000002c', 'karim@test.com', '{"full_name":"Karim Driver","phone":"0502220003"}'),
  ('00000000-0000-0000-0000-00000000002d', 'other@test.com', '{"full_name":"Other Driver","phone":"0502220004"}'),
  ('00000000-0000-0000-0000-00000000002e', 'op@test.com',    '{"full_name":"Op Erator","phone":"0502220005"}'),
  ('00000000-0000-0000-0000-00000000002f', 'mgr@test.com',   '{"full_name":"Man Ager","phone":"0502220006"}');
alter table profiles disable trigger user;
update profiles set account_type = 'merchant' where id = '00000000-0000-0000-0000-00000000002b';
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000002c', '00000000-0000-0000-0000-00000000002d');
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000002e';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000002f';
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000002e', 'EMP-S1'),
  ('00000000-0000-0000-0000-00000000002f', 'EMP-S2');
insert into business_accounts (id, company_name, contact_person, contact_email, contact_phone) values
  ('30000000-0000-0000-0000-00000000002b', 'Desert Rose Trading', 'Mona Merchant', 'mona@test.com', '0502220002');
insert into business_account_members (business_account_id, profile_id) values
  ('30000000-0000-0000-0000-00000000002b', '00000000-0000-0000-0000-00000000002b');
insert into shipment_batches (id, name, customer_id, created_by, status) values
  ('40000000-0000-0000-0000-00000000002b', 'Mona bulk', '00000000-0000-0000-0000-00000000002b', '00000000-0000-0000-0000-00000000002b', 'submitted');

-- s1-s5 (package_description carries the label). Booking times are UAE
-- time: s3 sits just after midnight on 8 Oct, s2 just before. s3 and s4
-- are one bulk booking.
create temp table seed (n int, cust text, code text, rname text, rphone text, pickup text, dropoff text, building text,
                        st shipment_status, at timestamptz, drv text, bulk boolean);
insert into seed values
  (1, 'a', 'STF2222A', 'Ahmed Hassan', '+971 50 123 4567', 'Dubai Marina Mall',  'Burj Khalifa, Downtown Dubai', null,            'delivered',       '2026-10-08 09:00+04', 'c',  false),
  (2, 'b', 'STF2222B', 'Sara Ali',     '050-765-4321',     'Clock Tower, Deira', 'Jumeirah Beach Residence',     null,            'in_transit',      '2026-10-07 23:30+04', 'd',  false),
  (3, 'b', 'STF2222C', 'AHMED KHAN',   '0559876543',       'Al Barsha',          'Business Bay',                 'Marina Gate 2', 'returned',        '2026-10-08 00:10+04', 'c',  true),
  (4, 'b', 'STF2222D', 'Omar',         '0551112222',       'Jumeirah 1',         'Dubai Marina',                 null,            'cancelled',       '2026-10-01 12:00+04', null, true),
  (5, 'a', 'STF2222E', 'Fatima 50%',   '0507778899',       'JLT',                'Al Quoz',                      null,            'pending_payment', '2026-09-20 12:00+04', null, false);
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
      ('00000000-0000-0000-0000-00000000002' || r.cust)::uuid, r.pickup, 25.09, 55.14, 'Sender Desk', '04 999 8888',
      r.dropoff, 25.08, 55.13, r.rname, r.rphone,
      14.6, 25, v_rule, 12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel'
    ) returning id into v_id;
    -- status, driver, code, batch straight to the target (superuser test setup only)
    alter table shipments disable trigger user;
    update shipments set
      created_at = r.at,
      package_description = 's' || r.n,
      tracking_number = r.code,
      dropoff_building = r.building,
      status = r.st,
      driver_id = case when r.drv is null then null else ('00000000-0000-0000-0000-00000000002' || r.drv)::uuid end,
      business_account_id = case when r.cust = 'b' then '30000000-0000-0000-0000-00000000002b'::uuid end,
      batch_id = case when r.bulk then '40000000-0000-0000-0000-00000000002b'::uuid end
    where id = v_id;
    alter table shipments enable trigger user;
  end loop;
end $$;
alter table shipments disable trigger user;
update shipments set legacy_tracking_number = 'DLV-20261007-abc123' where package_description = 's2';
alter table shipments enable trigger user;

grant execute on function t_staff(text, shipment_status[], date, date, account_type, boolean, uuid), t_check(text, text, text) to authenticated, anon;

\echo '── search_staff_shipments: operator ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000002e';
select t_check('no filters = every shipment',          t_staff(null), 's1,s2,s3,s4,s5');
select t_check('blank search = no search',             t_staff('   '), 's1,s2,s3,s4,s5');
-- Shipment ID
select t_check('ID exact',                             t_staff('STF2222A'), 's1');
select t_check('ID partial, other case',               t_staff('stf2222'), 's1,s2,s3,s4,s5');
select t_check('ID legacy',                            t_staff('DLV-20261007'), 's2');
select t_check('ID nonexistent',                       t_staff('QQQQ3333'), '-');
-- Recipient / sender name
select t_check('name full',                            t_staff('Ahmed Hassan'), 's1');
select t_check('name partial, any case',               t_staff('ahm'), 's1,s3');
select t_check('name other case',                      t_staff('ahmed khan'), 's3');
select t_check('name no match',                        t_staff('Zainab'), '-');
select t_check('sender name',                          t_staff('sender desk'), 's1,s2,s3,s4,s5');
select t_check('wildcard taken literally',             t_staff('50%'), 's5');
select t_check('% alone taken literally, not "all"',  t_staff('%'), 's5');
select t_check('underscore taken literally',           t_staff('_'), '-');
-- Phone, any format
select t_check('phone local',                          t_staff('0501234567'), 's1');
select t_check('phone international',                  t_staff('+971 55 987 6543'), 's3');
select t_check('phone formatted',                      t_staff('050 765 4321'), 's2');
select t_check('phone partial',                        t_staff('4321'), 's2');
-- Address
select t_check('drop-off address',                     t_staff('Burj Khalifa'), 's1');
select t_check('pickup address, other case',           t_staff('clock tower'), 's2');
select t_check('either address',                       t_staff('Dubai Marina'), 's1,s4');
select t_check('building typed at booking',            t_staff('marina gate'), 's3');
-- Who booked it, the company, the driver
select t_check('customer name',                        t_staff('ivy indiv'), 's1,s5');
select t_check('customer email',                       t_staff('mona@test'), 's2,s3,s4');
select t_check('company name',                         t_staff('desert rose'), 's2,s3,s4');
select t_check('driver name',                          t_staff('karim'), 's1,s3');
-- Status
select t_check('status delivered',                     t_staff(null, '{delivered}'), 's1');
select t_check('status returned',                      t_staff(null, '{returned}'), 's3');
select t_check('active group',                         t_staff(null, '{confirmed,assigned,driver_accepted,arrived_pickup,picked_up,in_transit,arrived_destination}'), 's2');
-- Date (UAE booking date)
select t_check('today (08 Oct)',                       t_staff(null, null, '2026-10-08', '2026-10-08'), 's1,s3');
select t_check('specific date (07 Oct, 23:30 UAE)',    t_staff(null, null, '2026-10-07', '2026-10-07'), 's2');
select t_check('date range',                           t_staff(null, null, '2026-10-01', '2026-10-07'), 's2,s4');
select t_check('date with no shipments',               t_staff(null, null, '2026-08-01', '2026-08-31'), '-');
-- The list's tabs and one bulk booking
select t_check('tab Individual',                       t_staff(null, acct => 'individual'), 's1,s5');
select t_check('tab Merchant',                         t_staff(null, acct => 'merchant'), 's2,s3,s4');
select t_check('tab Bulk: bulk shipments one by one',  t_staff(null, bulk => true), 's3,s4');
select t_check('one bulk batch',                       t_staff(null, batch => '40000000-0000-0000-0000-00000000002b'), 's3,s4');
-- Combined (AND between filter types)
select t_check('name + date',                          t_staff('ahmed', null, '2026-10-08', '2026-10-08'), 's1,s3');
select t_check('name + tab Merchant',                  t_staff('ahmed', acct => 'merchant'), 's3');
select t_check('address + status',                     t_staff('Dubai Marina', '{cancelled}'), 's4');
select t_check('ID + status + tab Bulk',               t_staff('STF2222C', '{returned}', bulk => true), 's3');
select t_check('driver + status',                      t_staff('karim', '{delivered}'), 's1');
select t_check('company + status',                     t_staff('desert rose', '{in_transit}'), 's2');
select t_check('name + batch + status',                t_staff('ahmed', '{returned}', batch => '40000000-0000-0000-0000-00000000002b'), 's3');
select t_check('phone + date',                         t_staff('0501234567', null, '2026-10-08', '2026-10-08'), 's1');
select t_check('combined, no match',                   t_staff('ahmed', '{cancelled}', '2026-10-08', '2026-10-08'), '-');

\echo '── manager ──'
set request.jwt.uid = '00000000-0000-0000-0000-00000000002f';
select t_check('manager: every shipment',              t_staff(null), 's1,s2,s3,s4,s5');
select t_check('manager: same matching',               t_staff('desert rose', '{returned}'), 's3');

\echo '── staff only ──'
set request.jwt.uid = '00000000-0000-0000-0000-00000000002c';
select t_check('driver: nothing, not even own',        t_staff(null), '-');
select t_check('driver: nothing by own ID',            t_staff('STF2222A'), '-');
set request.jwt.uid = '00000000-0000-0000-0000-00000000002b';
select t_check('customer: nothing, not even own',      t_staff(null), '-');
select t_check('customer: nothing by company',         t_staff('desert rose'), '-');
reset request.jwt.uid;
select t_check('no session: nothing',                  t_staff(null), '-');
reset role;

\echo '── operator edits show up in the next search ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000002e';
\echo 'LEGITIMATE: operator moves s2 in_transit -> arrived_destination and corrects the recipient name'
update shipments set status = 'arrived_destination' where package_description = 's2' returning status;
update shipments set dropoff_contact_name = 'Sara Ali Mansour' where package_description = 's2' returning dropoff_contact_name;
select t_check('old status filter drops it',           t_staff(null, '{in_transit}'), '-');
select t_check('new status filter has it',             t_staff(null, '{arrived_destination}'), 's2');
select t_check('finds the corrected name',             t_staff('mansour'), 's2');
reset request.jwt.uid;
reset role;

\echo '── the text search can use its trigram index ──'
-- Five rows are always scanned sequentially; with that ruled out, the
-- planner must be able to answer the search from shipments_search_trgm_idx.
set enable_seqscan = off;
do $$
declare
  v_line text;
  v_plan text := '';
begin
  for v_line in execute $q$
    explain select id from shipments
    where shipment_search_document(
            tracking_number, legacy_tracking_number, pickup_contact_name, dropoff_contact_name,
            pickup_address, dropoff_address, pickup_building, dropoff_building,
            pickup_contact_phone, dropoff_contact_phone
          ) like '%burj khalifa%'
  $q$ loop
    v_plan := v_plan || v_line || E'\n';
  end loop;
  perform t_check('search uses shipments_search_trgm_idx', (v_plan like '%shipments_search_trgm_idx%')::text, 'true');
end $$;
reset enable_seqscan;

\set ON_ERROR_STOP 0
set role anon;
\echo 'ATTACK: anon calls search_staff_shipments (expect permission denied)'
select count(*) from search_staff_shipments(null, null, null, null, null, false, null);
reset role;
