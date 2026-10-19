-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0048: card payments off (no client
-- can create or switch to a card shipment; a waiting card shipment moves to
-- cash without being marked paid), driver → operator and operator → manager
-- cash remittances (submission reserves but never clears; only confirmation
-- does; partial, repeated, over-limit, discrepancy and dispute cases;
-- custody; weekly carry-forward; who may see or do what), and that the same
-- cash is never counted twice across the three levels. Each check raises
-- "FAIL ..." on a wrong answer.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/cash-remittances.sql"

\set ON_ERROR_STOP 1

create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;

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

-- Operators (…9e, …9d), manager (…9f), drivers (…9a, …9b), customers (…9c, …98).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000009e', 'op9@test.com',    '{"full_name":"Op Nine","phone":"0509990001"}'),
  ('00000000-0000-0000-0000-00000000009d', 'op9b@test.com',   '{"full_name":"Op Nine B","phone":"0509990007"}'),
  ('00000000-0000-0000-0000-00000000009f', 'mgr9@test.com',   '{"full_name":"Mgr Nine","phone":"0509990002"}'),
  ('00000000-0000-0000-0000-00000000009a', 'drv9@test.com',   '{"full_name":"Drv Nine","phone":"0509990004"}'),
  ('00000000-0000-0000-0000-00000000009b', 'drv9b@test.com',  '{"full_name":"Drv Nine B","phone":"0509990005"}'),
  ('00000000-0000-0000-0000-00000000009c', 'cust9@test.com',  '{"full_name":"Cust Nine","phone":"0509990003"}'),
  ('00000000-0000-0000-0000-000000000098', 'cust9b@test.com', '{"full_name":"Cust Nine B","phone":"0509990006"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id in ('00000000-0000-0000-0000-00000000009e', '00000000-0000-0000-0000-00000000009d');
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000009f';
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000009a', '00000000-0000-0000-0000-00000000009b');
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000009e', 'EMP-R1'), ('00000000-0000-0000-0000-00000000009d', 'EMP-R3'),
  ('00000000-0000-0000-0000-00000000009f', 'EMP-R2');

create temp table ship (label text primary key, id uuid);
grant select on ship to authenticated, anon;

-- Fixtures written as the database, not through the paths under test.
create function t_ship(p_label text, p_payment text, p_price numeric, p_postpaid numeric default 0,
  p_status text default 'confirmed', p_payment_status text default 'pending')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into shipments (
    customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, payment_status, recipient_payment_type, cod_amount, package_type, package_description
  ) values (
    '00000000-0000-0000-0000-00000000009c', p_status::shipment_status, 'A', 25.09, 55.14, 'S', '0500000000',
    'B', 25.18, 55.27, 'R', '0500000001', 5, 10, p_price, 0, 0, 0, p_price,
    'AED', p_payment::payment_method, p_payment_status::payment_status,
    case when p_postpaid > 0 then 'postpaid' else 'prepaid' end::recipient_payment_type, p_postpaid, 'parcel', p_label
  ) returning id into v_id;
  insert into ship values (p_label, v_id);
  return v_id;
end $$;

-- Driver …9a: A = AED 200 goods + AED 15 cash fee; B = AED 20 cash fee;
-- C = AED 100 goods still to collect. Driver …9b: D = AED 50 cash fee.
select t_ship('A', 'cod', 15, 200), t_ship('B', 'cod', 20), t_ship('C', 'card', 0, 100), t_ship('D', 'cod', 50);
update shipments set driver_id = '00000000-0000-0000-0000-00000000009a', status = 'assigned'
where id in (select id from ship where label in ('A', 'B', 'C'));
update shipments set driver_id = '00000000-0000-0000-0000-00000000009b', status = 'assigned'
where id = (select id from ship where label = 'D');
-- Collections, confirmed by each driver (collected_by comes from the session).
set request.jwt.uid = '00000000-0000-0000-0000-00000000009a';
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'A');
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'B');
set request.jwt.uid = '00000000-0000-0000-0000-00000000009b';
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'D');
-- D was collected two weeks ago (to see it carried forward).
update cod_transactions set collected_at = now() - interval '14 days' where shipment_id = (select id from ship where label = 'D');
reset request.jwt.uid;

-- A card shipment from before 0048, still waiting for its payment, and one
-- already paid by card (with its payment row).
select t_ship('W', 'card', 21.60, 0, 'pending_payment', 'pending');
select t_ship('P', 'card', 21.60, 0, 'confirmed', 'paid');
insert into payments (shipment_id, customer_id, amount, method, status)
select id, '00000000-0000-0000-0000-00000000009c', 21.60, 'card', 'paid' from ship where label = 'P';

-- ════════════════════════════════════════════════════════════════════════
\echo '── Card payments are off ──'
select t_check('the flag is off', card_payments_enabled()::text, 'false');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009c';
select t_fails('ATTACK: customer books a card shipment through the API',
  $$insert into shipments (
    customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, package_type
  ) values (
    '00000000-0000-0000-0000-00000000009c', 'Dubai Marina', 25.09, 55.14, 'Cust', '0501111111', 'JBR', 25.08, 55.13, 'R', '0509999999',
    14.6, 25, (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'),
    12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel'
  )$$, '%Card payments are turned off%');
insert into shipments (
  customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price,
  currency, payment_method, package_type, package_description
) values (
  '00000000-0000-0000-0000-00000000009c', 'Dubai Marina', 25.09, 55.14, 'Cust', '0501111111', 'JBR', 25.08, 55.13, 'R', '0509999999',
  14.6, 25, (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'),
  12, 9.60, 0, 0, 21.60, 'AED', 'cod', 'parcel', 'cash-booking'
);
select t_check('LEGITIMATE: the same booking in cash is accepted',
  (select payment_method::text from shipments where package_description = 'cash-booking'), 'cod');
select t_fails('ATTACK: customer switches a cash shipment to card',
  format('update shipments set payment_method = %L where package_description = %L', 'card', 'cash-booking'), '%');
-- ATTACK: customer turns card payments on (no write policy: refused or a no-op).
do $$ begin update payment_settings set card_payments_enabled = true; exception when others then null; end $$;
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009e';
select t_fails('ATTACK: operator books a card shipment directly',
  $$insert into shipments (
    customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, price, currency, payment_method, package_type, booked_by
  ) values (
    '00000000-0000-0000-0000-00000000009c', 'A', 25.09, 55.14, 'S', '0500000000', 'B', 25.18, 55.27, 'R', '0500000001',
    5, 10, 12, 'AED', 'card', 'parcel', '00000000-0000-0000-0000-00000000009e'
  )$$, '%Card payments are turned off%');
reset role;
select t_check('payment settings unchanged', (select card_payments_enabled::text from payment_settings), 'false');

\echo '── A card shipment still waiting moves to cash ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000098';
select t_fails('ATTACK: another customer switches it',
  format('select switch_shipment_to_cash(%L)', (select id from ship where label = 'W')), '%Shipment not found%');
set request.jwt.uid = '00000000-0000-0000-0000-00000000009c';
select t_check('the customer switches it to cash', switch_shipment_to_cash((select id from ship where label = 'W'))::text, 'confirmed');
select t_check('a repeat changes nothing', switch_shipment_to_cash((select id from ship where label = 'W'))::text, 'confirmed');
select t_fails('a shipment already paid by card can''t switch',
  format('select switch_shipment_to_cash(%L)', (select id from ship where label = 'P')), '%already has a card payment%');
reset role;
select t_check('now cash, ready for dispatch, fee NOT marked paid',
  (select payment_method || '/' || status || '/' || payment_status from shipments where id = (select id from ship where label = 'W')),
  'cod/confirmed/pending');
select t_check('the customer is told it''s cash — never "payment successful"',
  (select count(*) filter (where type = 'shipment.switched_to_cash') || '|' || count(*) filter (where type = 'payment.success')
   from notifications where profile_id = '00000000-0000-0000-0000-00000000009c'),
  '1|0');
select t_check('one audit row for the switch',
  (select count(*)::text from audit_logs where action = 'shipment.switched_to_cash'), '1');
select t_check('the historical card payment is untouched',
  (select count(*) || '/' || max(status::text) || '/' || max(amount) from payments where shipment_id = (select id from ship where label = 'P')),
  '1/paid/21.60');

-- ════════════════════════════════════════════════════════════════════════
\echo '── Driver: what they hold ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009a';
select t_check('collected COD 200, fees 35, outstanding 235; AED 100 still to collect is not held',
  (select (o ->> 'collectedCod') || '|' || (o ->> 'collectedFee') || '|' || (o ->> 'outstanding') || '|' || (o ->> 'expected')
   from driver_cash_overview() o),
  '200.00|35.00|235.00|100.00');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009c';
select t_fails('ATTACK: a customer submits a remittance',
  $$select submit_driver_remittance(1, 0, null, gen_random_uuid())$$, '%Only drivers%');
select t_check('ATTACK: a customer reads a driver''s position', coalesce(driver_cash_overview('00000000-0000-0000-0000-00000000009a')::text, 'null'), 'null');
select t_check('ATTACK: a customer reads remittances', (select count(*)::text from driver_cash_remittances), '0');
set request.jwt.uid = '00000000-0000-0000-0000-00000000009e';
select t_fails('ATTACK: an operator submits a driver remittance',
  $$select submit_driver_remittance(1, 0, null, gen_random_uuid())$$, '%Only drivers%');
reset role;

\echo '── Driver: submit ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009a';
select t_fails('nothing to submit', $$select submit_driver_remittance(0, 0, null, gen_random_uuid())$$, '%greater than zero%');
select t_fails('negative', $$select submit_driver_remittance(-1, 5, null, gen_random_uuid())$$, '%AED 0 or more%');
select t_fails('three decimals', $$select submit_driver_remittance(1.005, 0, null, gen_random_uuid())$$, '%two decimal places%');
select t_fails('more COD than held', $$select submit_driver_remittance(200.01, 0, null, gen_random_uuid())$$, '%more COD than you hold%');
select t_fails('more fees than held', $$select submit_driver_remittance(0, 35.01, null, gen_random_uuid())$$, '%more in delivery fees%');
select submit_driver_remittance(200, 20, 'Week of deliveries', '90000000-0000-4000-8000-0000000000d1') ->> 'number' as r1 \gset
select t_check('a repeated submission returns the same remittance',
  submit_driver_remittance(200, 20, 'Week of deliveries', '90000000-0000-4000-8000-0000000000d1') ->> 'number', :'r1');
select t_fails('the same request id for different amounts',
  $$select submit_driver_remittance(100, 20, null, '90000000-0000-4000-8000-0000000000d1')$$, '%already used%');
select t_check('submitting does NOT clear the balance; it reserves it',
  (select (o ->> 'outstanding') || '|' || (o ->> 'pendingCod') || '|' || (o ->> 'pendingFee') || '|' || (o ->> 'availableCod') || '|' || (o ->> 'availableFee')
   from driver_cash_overview() o),
  '235.00|200.00|20.00|0.00|15.00');
select t_fails('the reserved COD can''t be submitted twice', $$select submit_driver_remittance(0.01, 0, null, gen_random_uuid())$$, '%more COD than you hold%');
select t_check('the driver sees only their own remittances', (select count(*)::text from driver_cash_remittances), '1');
select t_fails('ATTACK: the driver confirms their own remittance',
  format('select confirm_driver_remittance(%L, 200, 20, null)', (select id from driver_cash_remittances where remittance_number = :'r1')),
  '%Only operators and managers%');
reset role;
select t_check('one pending row, numbered, split, this week',
  (select count(*) || '|' || max(status) || '|' || max(cod_amount) || '|' || max(fee_amount) || '|' || (max(period_start) = dubai_week_start(now()))::text
   from driver_cash_remittances where driver_id = '00000000-0000-0000-0000-00000000009a'),
  '1|pending|200.00|20.00|true');
select t_check('the operators are told once',
  (select count(*)::text from notifications where type = 'cash.driver_remittance_submitted' and profile_id = '00000000-0000-0000-0000-00000000009e'), '1');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009b';
select t_check('ATTACK: another driver sees none of it', (select count(*)::text from driver_cash_remittances), '0');
select t_check('ATTACK: another driver reads the history', (select count(*)::text from driver_remittance_history('00000000-0000-0000-0000-00000000009a')), '0');
select t_check('ATTACK: another driver reads the position', coalesce(driver_cash_overview('00000000-0000-0000-0000-00000000009a')::text, 'null'), 'null');
select t_fails('the other driver can''t submit more than their own AED 50', $$select submit_driver_remittance(0, 50.01, null, gen_random_uuid())$$, '%more in delivery fees%');
reset role;

\echo '── Operator confirms ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009e';
select t_check('it is in the operators'' queue',
  (select count(*) || '|' || max(driver_name) || '|' || max(amount) from driver_remittance_queue('pending')), '1|Drv Nine|220.00');
select t_fails('more than submitted can''t be confirmed',
  format('select confirm_driver_remittance(%L, 200, 20.01, null)', (select id from driver_cash_remittances where remittance_number = :'r1')),
  '%more than the driver submitted%');
select confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'r1'), 200, 20, 'Counted at the hub') ->> 'driverOutstanding' as after1 \gset
select t_check('confirmation reduces the driver''s balance by exactly the amount', :'after1', '15.00');
select t_check('a repeated confirmation changes nothing',
  confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'r1'), 200, 20, 'Counted at the hub') ->> 'status', 'confirmed');
select t_check('the operator now holds it, by category',
  (select (o ->> 'receivedCod') || '|' || (o ->> 'receivedFee') || '|' || (o ->> 'outstanding') from operator_cash_overview() o),
  '200.00|20.00|220.00');
reset role;
select t_check('custody recorded', (select received_by || '|' || received_by_role from driver_cash_remittances where remittance_number = :'r1'),
  '00000000-0000-0000-0000-00000000009e|operator');
select t_check('one confirmation notice to the driver',
  (select count(*)::text from notifications where type = 'cash.driver_remittance_confirmed' and profile_id = '00000000-0000-0000-0000-00000000009a'), '1');
select t_check('the oldest collection it covers in full is settled; B (20 > 5 left) stays',
  (select string_agg(s.label || '=' || c.status, ',' order by s.label) from cod_transactions c join ship s on s.id = c.shipment_id where s.label in ('A', 'B')),
  'A=reconciled,B=collected');
select t_check('the 0042 dashboard agrees: collected 235, remitted 220, outstanding 15',
  (select collected || '|' || remitted || '|' || outstanding from driver_cash_summary() where driver_id = '00000000-0000-0000-0000-00000000009a'),
  '235.00|220.00|15.00');

\echo '── Discrepancy: the operator counts less ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009a';
select submit_driver_remittance(0, 15, null, gen_random_uuid()) ->> 'number' as r2 \gset
set request.jwt.uid = '00000000-0000-0000-0000-00000000009d';
select t_fails('a difference needs a reason',
  format('select confirm_driver_remittance(%L, 0, 10, null)', (select id from driver_cash_remittances where remittance_number = :'r2')),
  '%Explain the difference%');
select confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'r2'), 0, 10, 'Only AED 10 in the envelope') ->> 'countedNumber' as r2c \gset
select t_check('a repeat returns the same counted record',
  confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'r2'), 0, 10, 'Only AED 10 in the envelope') ->> 'countedNumber', :'r2c');
reset role;
select t_check('the submission is kept as submitted, disputed, with both amounts',
  (select status || '|' || amount || '|' || (decision_note like 'Counted AED 10.00 of AED 15.00: Only AED 10 in the envelope')::text
   from driver_cash_remittances where remittance_number = :'r2'),
  'disputed|15.00|true');
select t_check('the counted cash is its own confirmed record, linked, held by the counting operator',
  (select status || '|' || amount || '|' || fee_amount || '|' || received_by || '|' || (discrepancy_of = (select id from driver_cash_remittances where remittance_number = :'r2'))::text
   from driver_cash_remittances where remittance_number = :'r2c'),
  'confirmed|10.00|10.00|00000000-0000-0000-0000-00000000009d|true');
select t_check('the difference stays with the driver',
  (select outstanding::text from driver_cash_summary() where driver_id = '00000000-0000-0000-0000-00000000009a'), '5.00');

\echo '── Dispute: nothing counted ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009a';
select submit_driver_remittance(0, 5, null, gen_random_uuid()) ->> 'number' as r3 \gset
set request.jwt.uid = '00000000-0000-0000-0000-00000000009e';
select t_fails('a dispute needs a reason',
  format('select dispute_driver_remittance(%L, %L)', (select id from driver_cash_remittances where remittance_number = :'r3'), 'no'), '%reason for the dispute%');
select dispute_driver_remittance((select id from driver_cash_remittances where remittance_number = :'r3'), 'Driver did not hand anything over');
select t_check('a repeated dispute is a no-op',
  dispute_driver_remittance((select id from driver_cash_remittances where remittance_number = :'r3'), 'Driver did not hand anything over'), 'disputed');
select t_fails('a disputed remittance can''t then be confirmed',
  format('select confirm_driver_remittance(%L, 0, 5, null)', (select id from driver_cash_remittances where remittance_number = :'r3')), '%already disputed%');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009a';
select t_check('disputed: still visible, still outstanding, free to submit again',
  (select (o ->> 'outstanding') || '|' || (o ->> 'availableFee') || '|' || (o ->> 'disputedCount') from driver_cash_overview() o),
  '5.00|5.00|1');
select t_check('the driver''s history shows every remittance, with who decided',
  (select string_agg(remittance_number || '=' || status || '/' || coalesce(decided_by_name, '-'), ',' order by created_at)
   from driver_remittance_history()),
  :'r1' || '=confirmed/Op Nine,' || :'r2' || '=disputed/Op Nine B,' || :'r2c' || '=confirmed/Op Nine B,' || :'r3' || '=disputed/Op Nine');
reset role;

\echo '── Records are permanent ──'
select t_fails('a confirmed remittance can''t be edited (even by the database owner)',
  format('update driver_cash_remittances set amount = 1 where remittance_number = %L', :'r1'), '%only be confirmed or rejected once%');
select t_fails('nor deleted', format('delete from driver_cash_remittances where remittance_number = %L', :'r1'), '%can''t be deleted%');

\echo '── Weeks carry forward ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009b';
select t_check('two weeks ago: collected 50, closing 50',
  (select opening || '|' || collected_fee || '|' || confirmed || '|' || closing from driver_cash_weeks(null, 4) where week_start = dubai_week_start(now()) - 14),
  '0.00|50.00|0.00|50.00');
select t_check('this week opens with the AED 50 still held (not reset to zero)',
  (select opening || '|' || closing from driver_cash_weeks(null, 4) where week_start = dubai_week_start(now())), '50.00|50.00');
select t_check('the cards agree', (select (o ->> 'openingOutstanding') || '|' || (o ->> 'outstanding') from driver_cash_overview() o), '50.00|50.00');
reset role;

-- ════════════════════════════════════════════════════════════════════════
\echo '── Operator → manager ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009a';
select t_fails('ATTACK: a driver submits to the manager', $$select submit_operator_remittance(1, 0, null, gen_random_uuid())$$, '%Only operators%');
set request.jwt.uid = '00000000-0000-0000-0000-00000000009f';
select t_fails('a manager can''t submit to themselves', $$select submit_operator_remittance(1, 0, null, gen_random_uuid())$$, '%Only operators%');
set request.jwt.uid = '00000000-0000-0000-0000-00000000009e';
select t_fails('more COD than received', $$select submit_operator_remittance(200.01, 0, null, gen_random_uuid())$$, '%more COD than you hold%');
select submit_operator_remittance(200, 20, 'Weekly handover', '90000000-0000-4000-8000-0000000000e1') ->> 'number' as o1 \gset
select t_check('a repeated submission returns the same remittance',
  submit_operator_remittance(200, 20, 'Weekly handover', '90000000-0000-4000-8000-0000000000e1') ->> 'number', :'o1');
select t_fails('the reserved cash can''t be submitted twice', $$select submit_operator_remittance(0, 0.01, null, gen_random_uuid())$$, '%more in delivery fees%');
select t_check('submitting doesn''t clear the operator''s balance',
  (select (o ->> 'outstanding') || '|' || (o ->> 'pendingCod') || '|' || (o ->> 'pendingFee') from operator_cash_overview() o), '220.00|200.00|20.00');
select t_fails('ATTACK: the operator confirms their own remittance',
  format('select confirm_operator_remittance(%L, 200, 20, null)', (select id from operator_cash_remittances where remittance_number = :'o1')), '%Only a manager%');
select t_check('ATTACK: an operator reads the manager''s balances', (select count(*)::text from operator_cash_balances()), '0');
set request.jwt.uid = '00000000-0000-0000-0000-00000000009d';
select t_check('ATTACK: another operator sees none of it', (select count(*)::text from operator_cash_remittances), '0');
select t_check('ATTACK: another operator reads the position', coalesce(operator_cash_overview('00000000-0000-0000-0000-00000000009e')::text, 'null'), 'null');
reset role;
select t_check('the managers are told once',
  (select count(*)::text from notifications where type = 'cash.operator_remittance_submitted' and profile_id = '00000000-0000-0000-0000-00000000009f'), '1');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009f';
select t_check('the manager sees both operators'' balances',
  (select string_agg(operator_name || '=' || outstanding || '/' || pending, ',' order by operator_name) from operator_cash_balances()),
  'Op Nine=220.00/220.00,Op Nine B=10.00/0.00');
select confirm_operator_remittance((select id from operator_cash_remittances where remittance_number = :'o1'), 200, 20, null) ->> 'operatorOutstanding' as op_after \gset
select t_check('confirmation clears the operator''s balance to AED 0.00', :'op_after', '0.00');
select t_check('a repeated confirmation changes nothing',
  confirm_operator_remittance((select id from operator_cash_remittances where remittance_number = :'o1'), 200, 20, null) ->> 'status', 'confirmed');
reset role;
select t_check('one confirmation notice to the operator',
  (select count(*)::text from notifications where type = 'cash.operator_remittance_confirmed' and profile_id = '00000000-0000-0000-0000-00000000009e'), '1');

-- Op Nine B holds AED 10: hands over 10, the manager counts 6, then 4 is disputed.
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009d';
select submit_operator_remittance(0, 10, null, gen_random_uuid()) ->> 'number' as o2 \gset
set request.jwt.uid = '00000000-0000-0000-0000-00000000009f';
select t_fails('a difference needs a reason',
  format('select confirm_operator_remittance(%L, 0, 6, null)', (select id from operator_cash_remittances where remittance_number = :'o2')), '%Explain the difference%');
select confirm_operator_remittance((select id from operator_cash_remittances where remittance_number = :'o2'), 0, 6, 'Short by AED 4');
set request.jwt.uid = '00000000-0000-0000-0000-00000000009d';
select submit_operator_remittance(0, 4, null, gen_random_uuid()) ->> 'number' as o3 \gset
set request.jwt.uid = '00000000-0000-0000-0000-00000000009f';
select dispute_operator_remittance((select id from operator_cash_remittances where remittance_number = :'o3'), 'Not received yet');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009d';
select t_check('the shortfall and the disputed amount stay on the operator''s balance',
  (select (o ->> 'outstanding') || '|' || (o ->> 'availableFee') from operator_cash_overview() o), '4.00|4.00');
select t_check('the operator''s history keeps every step',
  (select string_agg(status || ':' || amount, ',' order by created_at) from operator_remittance_history()),
  'disputed:10.00,confirmed:6.00,disputed:4.00');
reset role;
select t_fails('a confirmed operator remittance can''t be edited',
  format('update operator_cash_remittances set amount = 1 where remittance_number = %L', :'o1'), '%only be confirmed or rejected once%');
select t_fails('nor deleted', format('delete from operator_cash_remittances where remittance_number = %L', :'o1'), '%can''t be deleted%');

\echo '── The cash is counted once ──'
-- A manager records AED 10 received straight from driver …9b (0042, unchanged).
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000009f';
select record_driver_remittance('00000000-0000-0000-0000-00000000009b', 10, 'cash', (now() at time zone 'Asia/Dubai')::date, null, null, gen_random_uuid());
select t_check('manager totals: 226 from operators, 10 directly, 4 with operators, 45 with drivers',
  (select (t ->> 'fromOperators') || '|' || (t ->> 'directFromDrivers') || '|' || (t ->> 'heldByOperators') || '|' || (t ->> 'heldByDrivers')
   from manager_cash_totals() t),
  '226.00|10.00|4.00|45.00');
select t_check('every dirham collected is in exactly one place',
  (select ((t ->> 'fromOperators')::numeric + (t ->> 'directFromDrivers')::numeric + (t ->> 'heldByOperators')::numeric + (t ->> 'heldByDrivers')::numeric)::text
   from manager_cash_totals() t),
  (select sum(collected_amount)::text from cod_transactions where collected_amount is not null));
select t_check('a staff-recorded remittance is numbered too',
  (select count(*)::text from driver_cash_remittances where remittance_number like 'DRM-%'), (select count(*)::text from driver_cash_remittances));
set request.jwt.uid = '00000000-0000-0000-0000-00000000009e';
select t_check('ATTACK: an operator reads the manager''s totals', coalesce(manager_cash_totals()::text, 'null'), 'null');
reset role;
