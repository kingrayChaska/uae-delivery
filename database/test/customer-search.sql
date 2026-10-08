-- Run after database/test/run.sh (a scratch database with every migration
-- applied). Checks migration 0032: search_customer_shipments() (name,
-- phone, status, UAE booking date, combined, ownership) and
-- get_batch_qr_tokens() (bulk labels), plus operator edits reaching the
-- merchant's search; and migration 0036: shipment ID and address search,
-- and customer_shipment_status_counts() behind the dashboard's status
-- cards, following status changes. Each check raises "FAIL ..." on a wrong
-- answer; the three ATTACK blocks at the end must end in "permission denied".
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/customer-search.sql"

\set ON_ERROR_STOP 1

create function t_got(q text, st shipment_status[], f date, t date) returns text language sql as $$
  select coalesce(string_agg(package_description, ',' order by package_description), '-')
  from search_customer_shipments(q, st, f, t)
$$;
create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'merchantA@test.com', '{"full_name":"Merchant A","phone":"0501111111"}'),
  ('00000000-0000-0000-0000-00000000000b', 'merchantB@test.com', '{"full_name":"Merchant B","phone":"0502222222"}'),
  ('00000000-0000-0000-0000-00000000000c', 'op@test.com', '{"full_name":"Op","phone":"0503333333"}');
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000000c';
insert into staff_profiles (profile_id, employee_id) values ('00000000-0000-0000-0000-00000000000c', 'EMP-9');

-- Merchant A's shipments n1-n5 and merchant B's n6 (package_description
-- carries the label): recipient name and phone as typed, status, and the
-- booking time in UAE time — n3 and n5 sit just after UAE midnight.
create temp table seed (n int, cust text, rname text, rphone text, st shipment_status, at timestamptz);
insert into seed values
  (1, 'a', 'Ahmed Khan',      '+971 50 123 4567', 'delivered',      '2026-10-01 10:00+04'),
  (2, 'a', 'AHMED ALI',       '050-765-4321',     'in_transit',     '2026-10-03 23:30+04'),
  (3, 'a', 'Sara Ahmed',      '00971559876543',   'cancelled',      '2026-10-06 00:10+04'),
  (4, 'a', 'Omar 50%',        '0551112222',       'pending_payment','2026-09-20 12:00+04'),
  (5, 'a', 'Fatima',          '0501234567',       'returned',       '2026-10-07 01:00+04'),
  (6, 'b', 'Ahmed Other',     '0501234567',       'delivered',      '2026-10-02 10:00+04');
-- Insert the seed rows as superuser (bypasses RLS; triggers still run).
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
      ('00000000-0000-0000-0000-00000000000' || r.cust)::uuid, 'Dubai Marina', 25.09, 55.14, 'Shop ' || r.cust, '04 111 2222',
      'JBR', 25.08, 55.13, r.rname, r.rphone,
      14.6, 25, v_rule, 12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel'
    ) returning id into v_id;
    update shipments set created_at = r.at, package_description = 'n' || r.n where id = v_id;
    -- status straight to the target (superuser test setup only)
    alter table shipments disable trigger user;
    update shipments set status = r.st where id = v_id;
    alter table shipments enable trigger user;
  end loop;
end $$;

-- Fixed shipment IDs (the search matches them, so random ones could
-- collide with a searched name or phone), and a few distinct addresses.
alter table shipments disable trigger user;
update shipments set tracking_number = 'WXY8822' || translate(right(package_description, 1), '123456', 'ABCDEF')
  where package_description in ('n1', 'n2', 'n3', 'n4', 'n5', 'n6');
update shipments set legacy_tracking_number = 'DLV-20261003-xyz789' where package_description = 'n2';
update shipments set dropoff_address = 'Burj Khalifa, Downtown Dubai' where package_description in ('n1', 'n6');
update shipments set pickup_address = 'Clock Tower, Deira' where package_description = 'n3';
update shipments set dropoff_building = 'Marina Gate 2' where package_description = 'n5';
alter table shipments enable trigger user;

insert into shipment_batches (id, name, customer_id, created_by, status) values
  ('10000000-0000-0000-0000-00000000000a', 'A bulk', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'submitted'),
  ('10000000-0000-0000-0000-0000000000e0', 'A empty', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'submitted');
alter table shipments disable trigger user;
update shipments set batch_id = '10000000-0000-0000-0000-00000000000a' where package_description in ('n1','n2','n3');
alter table shipments enable trigger user;

grant execute on function t_got(text, shipment_status[], date, date), t_check(text, text, text) to authenticated, anon;

\echo '── search_customer_shipments ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('no filters = all of A only',     t_got(null, null, null, null), 'n1,n2,n3,n4,n5');
select t_check('name exact',                     t_got('Ahmed Khan', null, null, null), 'n1');
select t_check('name partial, any case',         t_got('ahm', null, null, null), 'n1,n2,n3');
select t_check('name upper case',                t_got('AHMED', null, null, null), 'n1,n2,n3');
select t_check('name no result',                 t_got('Zainab', null, null, null), '-');
select t_check('wildcard taken literally',       t_got('50%', null, null, null), 'n4');
select t_check('underscore taken literally',     t_got('_', null, null, null), '-');
select t_check('sender name too (Shop a)',       t_got('shop', null, null, null), 'n1,n2,n3,n4,n5');
select t_check('phone full intl',                t_got('+971501234567', null, null, null), 'n1,n5');
select t_check('phone full local',               t_got('0501234567', null, null, null), 'n1,n5');
select t_check('phone formatted',                t_got('050 123 4567', null, null, null), 'n1,n5');
select t_check('phone 00971 prefix',             t_got('00971 55 987 6543', null, null, null), 'n3');
select t_check('phone partial',                  t_got('4567', null, null, null), 'n1,n5');
select t_check('phone partial w/ trunk 0',       t_got('0507654', null, null, null), 'n2');
select t_check('sender phone (04 111 2222)',     t_got('04 111 2222', null, null, null), 'n1,n2,n3,n4,n5');
select t_check('status delivered',               t_got(null, '{delivered}', null, null), 'n1');
select t_check('status in_transit',              t_got(null, '{in_transit}', null, null), 'n2');
select t_check('status cancelled',               t_got(null, '{cancelled}', null, null), 'n3');
select t_check('status pending_payment',         t_got(null, '{pending_payment}', null, null), 'n4');
select t_check('status returned',                t_got(null, '{returned}', null, null), 'n5');
select t_check('status assigned (none)',         t_got(null, '{assigned}', null, null), '-');
select t_check('active group',                   t_got(null, '{confirmed,assigned,driver_accepted,arrived_pickup,picked_up,in_transit,arrived_destination}', null, null), 'n2');
select t_check('one UAE date (06 Oct, 00:10 UAE)', t_got(null, null, '2026-10-06', '2026-10-06'), 'n3');
select t_check('one UAE date (03 Oct, 23:30 UAE)', t_got(null, null, '2026-10-03', '2026-10-03'), 'n2');
select t_check('range 01-06 Oct',                t_got(null, null, '2026-10-01', '2026-10-06'), 'n1,n2,n3');
select t_check('from only',                      t_got(null, null, '2026-10-06', null), 'n3,n5');
select t_check('to only',                        t_got(null, null, null, '2026-10-01'), 'n1,n4');
select t_check('name + date',                    t_got('ahmed', null, '2026-10-02', '2026-10-06'), 'n2,n3');
select t_check('name + status',                  t_got('ahmed', '{delivered}', null, null), 'n1');
select t_check('phone + status',                 t_got('0501234567', '{returned}', null, null), 'n5');
select t_check('date + status',                  t_got(null, '{cancelled}', '2026-10-01', '2026-10-06'), 'n3');
select t_check('name+phone(box)+date+status',    t_got('Ahmed', '{delivered}', '2026-10-01', '2026-10-06'), 'n1');
select t_check('combined, no match',             t_got('Ahmed', '{returned}', '2026-10-01', '2026-10-06'), '-');
-- Shipment ID and address (migration 0036).
select t_check('ID exact',                       t_got('WXY8822A', null, null, null), 'n1');
select t_check('ID partial, any case',           t_got('wxy88', null, null, null), 'n1,n2,n3,n4,n5');
select t_check('ID legacy',                      t_got('DLV-20261003', null, null, null), 'n2');
select t_check('ID nonexistent',                 t_got('QQQQ2222', null, null, null), '-');
select t_check('drop-off address',               t_got('Burj Khalifa', null, null, null), 'n1');
select t_check('pickup address, other case',     t_got('clock tower', null, null, null), 'n3');
select t_check('address partial',                t_got('downtown', null, null, null), 'n1');
select t_check('building typed at booking',      t_got('marina gate', null, null, null), 'n5');
select t_check('ID + status',                    t_got('WXY8822B', '{in_transit}', null, null), 'n2');
select t_check('ID + other status',              t_got('WXY8822B', '{delivered}', null, null), '-');
select t_check('address + date',                 t_got('Burj Khalifa', null, '2026-10-01', '2026-10-01'), 'n1');
select t_check('address + date, no match',       t_got('Burj Khalifa', null, '2026-10-02', '2026-10-06'), '-');
-- A status card's list, searched: In transit AND name AND date.
select t_check('In transit + name',              t_got('ahmed', '{in_transit}', null, null), 'n2');
select t_check('In transit + name + date',       t_got('ahmed', '{in_transit}', '2026-10-03', '2026-10-03'), 'n2');
select t_check('In transit + phone',             t_got('0507654321', '{in_transit}', null, null), 'n2');
select t_check('In transit + name, no match',    t_got('fatima', '{in_transit}', null, null), '-');
select t_check('Returned + phone',               t_got('0501234567', '{returned}', null, null), 'n5');
select t_check('Cancelled + name',               t_got('sara', '{cancelled}', null, null), 'n3');
select t_check('Delivered + ID',                 t_got('WXY8822A', '{delivered}', null, null), 'n1');
select t_check('A never sees B by ID',           t_got('WXY8822F', null, null, null), '-');
-- Ownership: B's matching shipment never appears for A, nor A's for B.
select t_check('A never sees B (Ahmed Other)',   t_got('Other', null, null, null), '-');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000b';
select t_check('B sees only own',                t_got('ahmed', null, null, null), 'n6');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000c';
select t_check('staff get nothing (own scope)',  t_got(null, null, null, null), '-');
reset request.jwt.uid;
select t_check('anonymous session gets nothing', t_got(null, null, null, null), '-');
reset role;

\echo '── customer_shipment_status_counts (dashboard status cards) ──'
create function t_counts() returns text language sql as $$
  select coalesce(string_agg(status || ':' || shipment_count, ',' order by status::text), '-')
  from customer_shipment_status_counts()
$$;
grant execute on function t_counts() to authenticated, anon;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('A: one count per status',        t_counts(), 'cancelled:1,delivered:1,in_transit:1,pending_payment:1,returned:1');
-- n1-n3 are one bulk shipment: each of its shipments counts on its own.
select t_check('A: bulk shipments counted individually',
  (select sum(shipment_count)::text from customer_shipment_status_counts()), '5');
select t_check('A: card count = its list''s length',
  (select shipment_count::text from customer_shipment_status_counts() where status = 'in_transit'),
  (select count(*)::text from search_customer_shipments(null, '{in_transit}', null, null)));
set request.jwt.uid = '00000000-0000-0000-0000-00000000000b';
select t_check('B: only own counts',             t_counts(), 'delivered:1');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000c';
select t_check('staff: no counts (own scope)',   t_counts(), '-');
reset request.jwt.uid;
select t_check('no session: no counts',          t_counts(), '-');
reset role;

\echo '── get_batch_qr_tokens ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('owner gets every token of the batch', (select count(*)::text from get_batch_qr_tokens('10000000-0000-0000-0000-00000000000a') where qr_token is not null), '3');
select t_check('tokens match the per-shipment function',
  (select bool_and(b.qr_token = get_shipment_qr_token(b.shipment_id))::text from get_batch_qr_tokens('10000000-0000-0000-0000-00000000000a') b), 'true');
select t_check('filter to one part (PostgREST .in())', (select count(*)::text from get_batch_qr_tokens('10000000-0000-0000-0000-00000000000a') b
  where b.shipment_id in (select id from shipments where package_description = 'n2')), '1');
select t_check('empty batch -> no tokens', (select count(*)::text from get_batch_qr_tokens('10000000-0000-0000-0000-0000000000e0')), '0');
select t_check('owner reads batch shipments (RLS)', (select count(*)::text from shipments where batch_id = '10000000-0000-0000-0000-00000000000a'), '3');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000b';
select t_check('other merchant: no tokens for A batch', (select count(*)::text from get_batch_qr_tokens('10000000-0000-0000-0000-00000000000a')), '0');
select t_check('other merchant: cannot read A batch', (select count(*)::text from shipment_batches where id = '10000000-0000-0000-0000-00000000000a'), '0');
select t_check('other merchant: cannot read A shipments', (select count(*)::text from shipments where batch_id = '10000000-0000-0000-0000-00000000000a'), '0');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000c';
select t_check('staff get tokens (as get_shipment_qr_token)', (select count(*)::text from get_batch_qr_tokens('10000000-0000-0000-0000-00000000000a')), '3');
reset request.jwt.uid;
select t_check('no session: nothing', (select count(*)::text from get_batch_qr_tokens('10000000-0000-0000-0000-00000000000a')), '0');
reset role;

\echo '── operator edits reach the merchant ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000c';
\echo 'LEGITIMATE: operator moves n2 in_transit -> arrived_destination and corrects the recipient name and phone'
update shipments set status = 'arrived_destination' where package_description = 'n2' returning status;
update shipments set dropoff_contact_name = 'Ahmed Ali Hassan', dropoff_contact_phone = '+971 52 000 1111' where package_description = 'n2' returning dropoff_contact_name;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('merchant: old status filter drops it',  t_got(null, '{in_transit}', null, null), '-');
select t_check('merchant: new status filter has it',     t_got(null, '{arrived_destination}', null, null), 'n2');
select t_check('merchant: still in the Active group',    t_got(null, '{confirmed,assigned,driver_accepted,arrived_pickup,picked_up,in_transit,arrived_destination}', null, null), 'n2');
select t_check('merchant: finds the corrected name',     t_got('hassan', null, null, null), 'n2');
select t_check('merchant: finds the corrected phone',    t_got('0520001111', null, null, null), 'n2');
select t_check('merchant: old phone no longer matches',  t_got('0507654321', null, null, null), '-');
reset role;

\echo '── business-wide list (merchant page Shipments card) ──'
-- Merchant A and colleague D are members of one business account; B is
-- not. A's n1 and n2 and D's n7 are the account's shipments.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'colleagueD@test.com', '{"full_name":"Colleague D","phone":"0504444444"}');
insert into business_accounts (id, company_name, contact_person, contact_email, contact_phone) values
  ('20000000-0000-0000-0000-00000000000a', 'Shop A LLC', 'Merchant A', 'a@test.com', '0501111111');
insert into business_account_members (business_account_id, profile_id) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d');
do $$
declare v_id uuid;
begin
  insert into shipments (
    customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price, currency, payment_method, package_type
  ) values (
    '00000000-0000-0000-0000-00000000000d', 'Dubai Marina', 25.09, 55.14, 'Shop A (D)', '04 111 2222',
    'JBR', 25.08, 55.13, 'Khalid Ahmed', '0567778888',
    14.6, 25, (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'), 12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel'
  ) returning id into v_id;
  alter table shipments disable trigger user;
  update shipments set package_description = 'n7', created_at = '2026-10-04 09:00+04', status = 'delivered' where id = v_id;
  update shipments set business_account_id = '20000000-0000-0000-0000-00000000000a' where package_description in ('n1', 'n2', 'n7');
  alter table shipments enable trigger user;
end $$;

create function t_gotb(q text, st shipment_status[], ba uuid) returns text language sql as $$
  select coalesce(string_agg(package_description, ',' order by package_description), '-')
  from search_customer_shipments(q, st, null, null, ba)
$$;
grant execute on function t_gotb(text, shipment_status[], uuid) to authenticated;

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('member: whole business list',            t_gotb(null, null, '20000000-0000-0000-0000-00000000000a'), 'n1,n2,n7');
select t_check('member: list total = Shipments card',
  (select count(*)::text from search_customer_shipments(null, null, null, null, '20000000-0000-0000-0000-00000000000a')),
  (select shipment_count::text from business_shipment_stats where business_account_id = '20000000-0000-0000-0000-00000000000a'));
select t_check('member: filters apply in business scope', t_gotb('ahmed', '{delivered}', '20000000-0000-0000-0000-00000000000a'), 'n1,n7');
select t_check('member: own list unchanged',             t_got(null, null, null, null), 'n1,n2,n3,n4,n5');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000d';
select t_check('colleague sees the same business list',  t_gotb(null, null, '20000000-0000-0000-0000-00000000000a'), 'n1,n2,n7');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000b';
select t_check('non-member: nothing for that account',   t_gotb(null, null, '20000000-0000-0000-0000-00000000000a'), '-');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000c';
select t_check('staff: not a member, nothing',           t_gotb(null, null, '20000000-0000-0000-0000-00000000000a'), '-');
reset request.jwt.uid;
reset role;

\echo '── status changes move shipments between cards and lists ──'
-- Statuses set directly (superuser): what's checked is that the cards and
-- lists read the persisted status, however it was changed.
create function t_move(label text, status_to shipment_status) returns void language plpgsql as $$
begin
  execute 'alter table shipments disable trigger user';
  update shipments set status = status_to where package_description = label;
  execute 'alter table shipments enable trigger user';
end $$;
create function t_card(st shipment_status) returns text language sql as $$
  select coalesce((select shipment_count::text from customer_shipment_status_counts() where status = st), '0')
$$;
grant execute on function t_card(shipment_status) to authenticated;

select t_move('n2', 'in_transit');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('start: In transit card',         t_card('in_transit'), '1');
select t_check('start: Delivered card',          t_card('delivered'), '1');
reset role;

select t_move('n2', 'delivered');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('in_transit->delivered: In transit card', t_card('in_transit'), '0');
select t_check('in_transit->delivered: Delivered card',  t_card('delivered'), '2');
select t_check('in_transit->delivered: In transit list', t_got(null, '{in_transit}', null, null), '-');
select t_check('in_transit->delivered: Delivered list',  t_got(null, '{delivered}', null, null), 'n1,n2');
reset role;

select t_move('n2', 'in_transit');
select t_move('n2', 'returned');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('in_transit->returned: Returned card',  t_card('returned'), '2');
select t_check('in_transit->returned: Returned list',  t_got(null, '{returned}', null, null), 'n2,n5');
select t_check('in_transit->returned: Delivered card', t_card('delivered'), '1');
reset role;

select t_move('n2', 'in_transit');
select t_move('n2', 'cancelled');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('in_transit->cancelled: Cancelled card',  t_card('cancelled'), '2');
select t_check('in_transit->cancelled: Cancelled list',  t_got(null, '{cancelled}', null, null), 'n2,n3');
select t_check('in_transit->cancelled: In transit card', t_card('in_transit'), '0');
reset role;

select t_move('n4', 'in_transit');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000000a';
select t_check('pending->in_transit: In transit card',   t_card('in_transit'), '1');
select t_check('pending->in_transit: In transit list',   t_got(null, '{in_transit}', null, null), 'n4');
select t_check('pending->in_transit: no longer pending', t_card('pending_payment'), '0');
set request.jwt.uid = '00000000-0000-0000-0000-00000000000b';
select t_check('B''s counts untouched',          t_counts(), 'delivered:1');
reset request.jwt.uid;
reset role;

\set ON_ERROR_STOP 0
set role anon;
\echo 'ATTACK: anon calls search_customer_shipments (expect permission denied)'
select count(*) from search_customer_shipments(null, null, null, null);
\echo 'ATTACK: anon calls get_batch_qr_tokens (expect permission denied)'
select count(*) from get_batch_qr_tokens('10000000-0000-0000-0000-00000000000a');
\echo 'ATTACK: anon calls customer_shipment_status_counts (expect permission denied)'
select count(*) from customer_shipment_status_counts();
reset role;
