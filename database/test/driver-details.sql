-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0049: one driver's shipments for the
-- operator dashboard — counts by status that match the list, search
-- (tracking number, id, names, phone in any format, address) only within
-- that driver, status filters with search, the booking period, each
-- shipment's own price, cash collected only from verified collections (by
-- collection date; expected cash is never "collected"), no inflation from
-- extra status-history or payment rows, the balance from 0048, and that
-- only staff can read any of it. Each check raises "FAIL ..." on a wrong
-- answer.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/driver-details.sql"

\set ON_ERROR_STOP 1

create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;

grant execute on function t_check(text, text, text) to authenticated, anon;

-- Operator (…7e), manager (…7f), drivers (…7a, …7b), customer (…7c).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000007e', 'op7@test.com',   '{"full_name":"Op Seven","phone":"0507770001"}'),
  ('00000000-0000-0000-0000-00000000007f', 'mgr7@test.com',  '{"full_name":"Mgr Seven","phone":"0507770002"}'),
  ('00000000-0000-0000-0000-00000000007a', 'drv7@test.com',  '{"full_name":"Drv Seven","phone":"0507770004"}'),
  ('00000000-0000-0000-0000-00000000007b', 'drv7b@test.com', '{"full_name":"Drv Seven B","phone":"0507770005"}'),
  ('00000000-0000-0000-0000-00000000007c', 'cust7@test.com', '{"full_name":"Cust Seven","phone":"0507770003"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000007e';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000007f';
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000007a', '00000000-0000-0000-0000-00000000007b');
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000007e', 'EMP-D1'), ('00000000-0000-0000-0000-00000000007f', 'EMP-D2');
insert into driver_profiles (profile_id, driver_code, license_number, availability) values
  ('00000000-0000-0000-0000-00000000007a', 'DRV-707', 'L-707', 'available'),
  ('00000000-0000-0000-0000-00000000007b', 'DRV-708', 'L-708', 'offline');

create temp table ship (label text primary key, id uuid);
grant select on ship to authenticated, anon;

-- Fixtures written as the database, not through the paths under test.
-- Each shipment has its own price, recipient, phone and address.
create function t_ship(p_label text, p_payment text, p_price numeric, p_postpaid numeric,
  p_recipient text, p_phone text, p_address text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into shipments (
    customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, payment_status, recipient_payment_type, cod_amount, package_type, package_description
  ) values (
    '00000000-0000-0000-0000-00000000007c', 'confirmed', 'Warehouse 7, Al Quoz', 25.09, 55.14, 'Sender Co', '0500000000',
    p_address, 25.18, 55.27, p_recipient, p_phone, 5, 10, p_price, 0, 0, 0, p_price,
    'AED', p_payment::payment_method, case when p_payment = 'card' then 'paid' else 'pending' end::payment_status,
    case when p_postpaid > 0 then 'postpaid' else 'prepaid' end::recipient_payment_type, p_postpaid, 'parcel', p_label
  ) returning id into v_id;
  insert into ship values (p_label, v_id);
  return v_id;
end $$;

create function t_move(p_labels text[], p_status text) returns void language sql as $$
  update shipments set status = p_status::shipment_status where id in (select id from ship where label = any (p_labels));
$$;

-- Driver …7a:
--   d1  delivered; cash fee 21.60 + AED 200 goods, collected
--   d2  delivered; fee 33.00 paid by card, prepaid (no cash at all)
--   t1  in transit; cash fee 30.00 still to collect
--   a1  assigned (pending), booked 60 days ago; cash fee 18.00 + AED 100 goods to collect
--   c1  cancelled; r1 returned; f1 delivery failed
-- Driver …7b: y1 delivered; cash fee 50.00 collected.
select t_ship('d1', 'cod', 21.60, 200, 'Rana Haddad', '0507771234', '12 Marina Walk, Dubai Marina'),
       t_ship('d2', 'card', 33.00, 0, 'Omar Saleh', '0501112222', 'JLT Cluster D'),
       t_ship('t1', 'cod', 30.00, 0, 'Lina Farouk', '0503334444', 'Business Bay Tower'),
       t_ship('a1', 'cod', 18.00, 100, 'Karim Nassar', '0505556666', 'Deira Gold Souk'),
       t_ship('c1', 'cod', 25.00, 0, 'Huda Ali', '0507778888', 'Mirdif Hills'),
       t_ship('r1', 'card', 40.00, 0, 'Samir Aziz', '0509990000', 'Al Barsha 1'),
       t_ship('f1', 'card', 27.50, 0, 'Noor Khan', '0501231234', 'Jumeirah Village'),
       t_ship('y1', 'cod', 50.00, 0, 'Rania Other', '0502223333', 'Rana Street, Satwa');

update shipments set driver_id = '00000000-0000-0000-0000-00000000007a', status = 'assigned'
where id in (select id from ship where label <> 'y1');
update shipments set driver_id = '00000000-0000-0000-0000-00000000007b', status = 'assigned'
where id = (select id from ship where label = 'y1');
select t_move(array['d1', 'd2', 't1', 'r1', 'f1', 'y1'], 'driver_accepted');
select t_move(array['d1', 'd2', 't1', 'r1', 'f1', 'y1'], 'arrived_pickup');
select t_move(array['d1', 'd2', 't1', 'r1', 'f1', 'y1'], 'picked_up');
select t_move(array['d1', 'd2', 't1', 'r1', 'f1', 'y1'], 'in_transit');
select t_move(array['r1', 'f1'], 'delivery_failed');
select t_move(array['r1'], 'returned');
select t_move(array['d1', 'd2', 'y1'], 'arrived_destination');
select t_move(array['d1', 'd2', 'y1'], 'delivered');
select t_move(array['c1'], 'cancelled');
-- a1 was booked two months ago.
update shipments set created_at = now() - interval '60 days' where id = (select id from ship where label = 'a1');

-- Collections, confirmed by each driver (collected_by comes from the session).
set request.jwt.uid = '00000000-0000-0000-0000-00000000007a';
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'd1');
set request.jwt.uid = '00000000-0000-0000-0000-00000000007b';
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'y1');
reset request.jwt.uid;

-- Rows that would inflate a careless join: a second 'delivered' history row
-- and a second payment for d1.
insert into shipment_status_history (shipment_id, status, note)
select id, 'delivered', 'duplicate event' from ship where label = 'd1';
insert into payments (shipment_id, customer_id, amount, method, status)
select id, '00000000-0000-0000-0000-00000000007c', 33.00, 'card', 'paid' from ship where label = 'd2';
insert into payments (shipment_id, customer_id, amount, method, status)
select id, '00000000-0000-0000-0000-00000000007c', 33.00, 'card', 'failed' from ship where label = 'd2';

\echo '── Fixtures ──'
select t_check('cash records: d1 collected, t1 and a1 expected, cancelled c1 has none',
  (select string_agg(s.label || '=' || c.status, ',' order by s.label) from cod_transactions c join ship s on s.id = c.shipment_id
   where s.label <> 'y1'),
  'a1=expected,d1=collected,t1=expected');

-- ════════════════════════════════════════════════════════════════════════
\echo '── Counts ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000007e';
select t_check('every status of the driver''s 7 shipments, each counted once',
  (select string_agg(status || '=' || shipments, ',' order by status::text)
   from staff_driver_shipment_counts('00000000-0000-0000-0000-00000000007a')),
  'assigned=1,cancelled=1,delivered=2,delivery_failed=1,in_transit=1,returned=1');
select t_check('the list has the same 7 rows (no duplicates from history or payments)',
  (select count(*) || '/' || count(distinct id) from staff_driver_shipments('00000000-0000-0000-0000-00000000007a')), '7/7');
select t_check('the other driver''s shipment is never in this list',
  (select count(*)::text from staff_driver_shipments('00000000-0000-0000-0000-00000000007a') where id = (select id from ship where label = 'y1')), '0');

\echo '── Each shipment''s own figures ──'
select t_check('own price, COD amount and what was collected on it',
  (select string_agg(s.label || '=' || l.price || '/' || l.cod_amount || '/' || coalesce(l.cod_collected::text, '-') || '/'
     || coalesce(l.fee_collected::text, '-') || '/' || coalesce(l.cash_expected::text, '-') || '/' || coalesce(l.cash_status, '-'), ',' order by s.label)
   from staff_driver_shipments('00000000-0000-0000-0000-00000000007a') l join ship s on s.id = l.id),
  'a1=18.00/100.00/-/-/118.00/expected,c1=25.00/0.00/-/-/-/-,d1=21.60/200.00/200.00/21.60/-/collected,'
  || 'd2=33.00/0.00/-/-/-/-,f1=27.50/0.00/-/-/-/-,r1=40.00/0.00/-/-/-/-,t1=30.00/0.00/-/-/30.00/expected');
select t_check('prepaid by card: paid, no cash status', (select payment_method || '/' || payment_status || '/' || recipient_payment_type
   from staff_driver_shipments('00000000-0000-0000-0000-00000000007a') where id = (select id from ship where label = 'd2')), 'card/paid/prepaid');
select t_check('finished shipments have a completion time; active ones don''t',
  (select string_agg(s.label || '=' || (l.completed_at is not null)::text, ',' order by s.label)
   from staff_driver_shipments('00000000-0000-0000-0000-00000000007a') l join ship s on s.id = l.id),
  'a1=false,c1=true,d1=true,d2=true,f1=true,r1=true,t1=false');

\echo '── Search ──'
select t_check('by recipient name, any case, only this driver (y1 "Rania Other" / "Rana Street" is the other driver''s)',
  (select string_agg(s.label, ',' order by s.label) from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', 'rANA') l join ship s on s.id = l.id),
  'd1');
select t_check('by phone in another format',
  (select string_agg(s.label, ',') from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', '+971 50 777 1234') l join ship s on s.id = l.id), 'd1');
select t_check('by part of the delivery address',
  (select string_agg(s.label, ',') from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', 'business bay') l join ship s on s.id = l.id), 't1');
select t_check('by the pickup address: all 7',
  (select count(*)::text from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', 'al quoz')), '7');
select t_check('by tracking number',
  (select string_agg(s.label, ',') from staff_driver_shipments('00000000-0000-0000-0000-00000000007a',
     (select substr(tracking_number, 5) from shipments where id = (select id from ship where label = 'f1'))) l join ship s on s.id = l.id), 'f1');
select t_check('by the shipment id',
  (select string_agg(s.label, ',') from staff_driver_shipments('00000000-0000-0000-0000-00000000007a',
     (select upper(id::text) from ship where label = 'r1')) l join ship s on s.id = l.id), 'r1');
select t_check('wildcards are literal', (select count(*)::text from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', '%')), '0');
select t_check('no match: nothing', (select count(*)::text from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', 'zzz-nothing')), '0');

\echo '── Filters ──'
select t_check('delivered only', (select string_agg(s.label, ',' order by s.label)
   from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', null, array['delivered']::shipment_status[]) l join ship s on s.id = l.id), 'd1,d2');
select t_check('search and filter together',
  (select string_agg(s.label, ',' order by s.label)
   from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', 'jlt', array['delivered']::shipment_status[]) l join ship s on s.id = l.id), 'd2');
select t_check('the counts follow the search, so a filter''s count is its rows',
  (select string_agg(status || '=' || shipments, ',' order by status::text)
   from staff_driver_shipment_counts('00000000-0000-0000-0000-00000000007a', 'jlt')), 'delivered=1');
select t_check('every status: count = rows',
  (select bool_and(c.shipments = (select count(*) from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', null, array[c.status])))::text
   from staff_driver_shipment_counts('00000000-0000-0000-0000-00000000007a') c), 'true');

\echo '── Period ──'
select t_check('booked in the last 30 days: a1 (60 days ago) left out of rows and counts',
  (select count(*) || '|' || (select coalesce(sum(shipments), 0) from staff_driver_shipment_counts('00000000-0000-0000-0000-00000000007a', null,
     ((now() at time zone 'Asia/Dubai')::date - 30), (now() at time zone 'Asia/Dubai')::date))
   from staff_driver_shipments('00000000-0000-0000-0000-00000000007a', null, null,
     ((now() at time zone 'Asia/Dubai')::date - 30), (now() at time zone 'Asia/Dubai')::date)),
  '6|6');
reset role;

\echo '── Money ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000007e';
select t_check('collected: only d1''s verified cash — COD 200 and fee 21.60, apart; expected cash isn''t collected',
  (select (o #>> '{period,codCollected}') || '|' || (o #>> '{period,feeCollected}') || '|' || (o #>> '{period,collectedShipments}')
     || '|' || (o #>> '{now,expectedCod}') || '|' || (o #>> '{now,expectedFee}')
   from staff_driver_overview('00000000-0000-0000-0000-00000000007a') o),
  '200.00|21.60|1|100.00|48.00');
select t_check('charges are not collections: every non-cancelled shipment''s own price, once',
  (select (o #>> '{period,charges}') || '|' || (o #>> '{period,cashCharges}') || '|' || (o #>> '{period,codDue}')
   from staff_driver_overview('00000000-0000-0000-0000-00000000007a') o),
  '170.10|69.60|300.00');
select t_check('the balance is 0048''s: collected, nothing confirmed yet',
  (select (o #>> '{now,outstanding}') || '|' || (o #>> '{now,outstandingCod}') || '|' || (o #>> '{now,outstandingFee}') || '|' || (o #>> '{now,pending}')
   from staff_driver_overview('00000000-0000-0000-0000-00000000007a') o),
  '221.60|200.00|21.60|0.00');
select t_check('the cash page agrees', (driver_cash_overview('00000000-0000-0000-0000-00000000007a') ->> 'outstanding'), '221.60');
reset role;
-- The collection happened 40 days ago: a 30-day period has no cash in it,
-- though the shipment and the balance are unchanged.
update cod_transactions set collected_at = now() - interval '40 days' where shipment_id = (select id from ship where label = 'd1');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000007e';
select t_check('cash is dated by when it was collected, not when it was booked',
  (select (o #>> '{period,codCollected}') || '|' || (o #>> '{period,feeCollected}') || '|' || (o #>> '{now,outstanding}')
   from staff_driver_overview('00000000-0000-0000-0000-00000000007a', (now() at time zone 'Asia/Dubai')::date - 30, null) o),
  '0.00|0.00|221.60');
select t_check('the driver''s header', (select (o #>> '{driver,name}') || '|' || (o #>> '{driver,code}') || '|' || (o #>> '{driver,availability}')
   from staff_driver_overview('00000000-0000-0000-0000-00000000007a') o), 'Drv Seven|DRV-707|available');
select t_check('not a driver: nothing', coalesce(staff_driver_overview('00000000-0000-0000-0000-00000000007c')::text, 'null'), 'null');
reset role;

\echo '── Split totals for the lists ──'
select t_check('driver_cod_stats: verified COD and fee apart; legacy column unchanged',
  (select collected_total || '|' || cod_collected || '|' || fee_collected from driver_cod_stats where driver_id = '00000000-0000-0000-0000-00000000007a'),
  '221.60|200.00|21.60');

\echo '── Who may see it ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000007f';
select t_check('a manager sees it too', (select count(*)::text from staff_driver_shipments('00000000-0000-0000-0000-00000000007a')), '7');
set request.jwt.uid = '00000000-0000-0000-0000-00000000007c';
select t_check('ATTACK: a customer lists a driver''s shipments', (select count(*)::text from staff_driver_shipments('00000000-0000-0000-0000-00000000007a')), '0');
select t_check('ATTACK: a customer counts them', (select count(*)::text from staff_driver_shipment_counts('00000000-0000-0000-0000-00000000007a')), '0');
select t_check('ATTACK: a customer reads the money', coalesce(staff_driver_overview('00000000-0000-0000-0000-00000000007a')::text, 'null'), 'null');
set request.jwt.uid = '00000000-0000-0000-0000-00000000007b';
select t_check('ATTACK: another driver lists them', (select count(*)::text from staff_driver_shipments('00000000-0000-0000-0000-00000000007a')), '0');
select t_check('ATTACK: another driver reads the money', coalesce(staff_driver_overview('00000000-0000-0000-0000-00000000007a')::text, 'null'), 'null');
set request.jwt.uid = '00000000-0000-0000-0000-00000000007a';
select t_check('ATTACK: the driver reads their own staff view', (select count(*)::text from staff_driver_shipments('00000000-0000-0000-0000-00000000007a')), '0');
reset role;
set role anon;
reset request.jwt.uid;
do $$ begin
  perform staff_driver_overview('00000000-0000-0000-0000-00000000007a');
  raise exception 'FAIL anon could call staff_driver_overview';
exception when insufficient_privilege then raise notice 'ok  anon is refused';
end $$;
reset role;

\echo 'driver-details: all checks passed'
