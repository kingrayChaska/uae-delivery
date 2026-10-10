-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0042: verified cash collections,
-- driver remittances (pending / confirmed / rejected), settlement, the
-- balances on the reconciliation dashboard, and who may see or change any
-- of it. Each check raises "FAIL ..." on a wrong answer.
--
-- The worked example: driver A collects AED 1,000 (four shipments: 100,
-- 200, 300, 400), hands over AED 600, owes AED 400, and has AED 200 still
-- to collect on an undelivered shipment.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/driver-cash.sql"

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

-- Driver A's row on the dashboard, as "collected/remitted/outstanding/pending/expected/unverified".
create function t_pos(p_driver uuid) returns text language sql as $$
  select collected || '/' || remitted || '/' || outstanding || '/' || pending || '/' || expected || '/' || unverified
  from driver_cash_summary() where driver_id = p_driver
$$;

grant execute on function t_check(text, text, text), t_fails(text, text, text), t_pos(uuid) to authenticated, anon;

-- Operator (…7e), manager (…7f), customer (…7c), driver A (…7a), driver B (…7b).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000007e', 'op7@test.com',   '{"full_name":"Op Seven","phone":"0507770001"}'),
  ('00000000-0000-0000-0000-00000000007f', 'mgr7@test.com',  '{"full_name":"Mgr Seven","phone":"0507770002"}'),
  ('00000000-0000-0000-0000-00000000007c', 'cust7@test.com', '{"full_name":"Cust Seven","phone":"0507770003"}'),
  ('00000000-0000-0000-0000-00000000007a', 'drvA@test.com',  '{"full_name":"Aziz Driver","phone":"0507770004"}'),
  ('00000000-0000-0000-0000-00000000007b', 'drvB@test.com',  '{"full_name":"Bilal Driver","phone":"0507770005"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000007e';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000007f';
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000007a', '00000000-0000-0000-0000-00000000007b');
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000007e', 'EMP-K1'), ('00000000-0000-0000-0000-00000000007f', 'EMP-K2');

-- k1..k5 driver A's postpaid shipments (goods 100/200/300/400/200, delivery
-- fee by card, so the cash is the goods amount only); k6 driver B's; k7
-- driver A's prepaid by card (no cash at all); k8 driver A's, collected
-- before migration 0042 (legacy, unverified).
create temp table ship (label text primary key, id uuid, cod numeric);
grant select on ship to authenticated, anon;
insert into ship values ('k1', null, 100), ('k2', null, 200), ('k3', null, 300), ('k4', null, 400),
  ('k5', null, 200), ('k6', null, 50), ('k7', null, 0), ('k8', null, 75);
do $$
declare v_rule uuid; r record; v_id uuid;
begin
  select id into v_rule from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual';
  for r in select * from ship order by label loop
    insert into shipments (
      customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
      dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
      distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price,
      currency, payment_method, recipient_payment_type, cod_amount, package_type, package_description
    ) values (
      '00000000-0000-0000-0000-00000000007c', 'confirmed', 'A', 25.09, 55.14, 'S', '0500000000',
      'B', 25.18, 55.27, 'R', '0500000001', 14.6, 25, v_rule, 12, 9.60, 0,
      case when r.cod > 0 then 2 else 0 end, case when r.cod > 0 then 23.60 else 21.60 end,
      'AED', 'card', case when r.cod > 0 then 'postpaid' else 'prepaid' end::recipient_payment_type, r.cod, 'parcel', r.label
    ) returning id into v_id;
    update ship set id = v_id where label = r.label;
    update shipments set status = 'assigned',
      driver_id = case when r.label = 'k6' then '00000000-0000-0000-0000-00000000007b' else '00000000-0000-0000-0000-00000000007a' end::uuid
    where id = v_id;
  end loop;
end $$;

select t_check('expected records only for cash shipments',
  (select string_agg(s.label || '=' || c.amount, ',' order by s.label) from cod_transactions c join ship s on s.id = c.shipment_id),
  'k1=100.00,k2=200.00,k3=300.00,k4=400.00,k5=200.00,k6=50.00,k8=75.00');

-- k8: collected before 0042 — no amount was ever recorded for it.
alter table cod_transactions disable trigger cod_transactions_record_collection;
update cod_transactions set status = 'collected', collected_at = now() - interval '30 days' where shipment_id = (select id from ship where label = 'k8');
alter table cod_transactions enable trigger cod_transactions_record_collection;

\echo '── Collections ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000007a';
-- The driver marks k1..k4 collected, trying to record a smaller amount on k1.
update cod_transactions set status = 'collected', collected_at = now(), collected_amount = 1
where shipment_id = (select id from ship where label = 'k1');
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'k2');
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'k3');
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'k4');
select t_check('collected amount comes from the record, not the request',
  (select collected_amount || ' ' || collected_by from cod_transactions where shipment_id = (select id from ship where label = 'k1')),
  '100.00 00000000-0000-0000-0000-00000000007a');
select t_fails('a repeated "collected" can''t count twice',
  format('update cod_transactions set status = %L where shipment_id = %L', 'collected', (select id from ship where label = 'k1')),
  '%may only mark their own expected COD as collected%');
select t_fails('ATTACK: driver edits a recorded collection',
  format('update cod_transactions set collected_amount = 5 where shipment_id = %L', (select id from ship where label = 'k2')),
  '%may only mark their own expected COD%');
select t_check('driver cannot see remittances', (select count(*)::text from driver_cash_remittances), '0');
select t_check('driver gets nothing from the dashboard', (select count(*)::text from driver_cash_summary()), '0');
select t_fails('ATTACK: driver records a remittance',
  $$select record_driver_remittance('00000000-0000-0000-0000-00000000007a', 1000, 'cash', current_date, null, null, gen_random_uuid())$$,
  '%Only operators and managers%');
reset role;
select t_fails('ATTACK: even staff can''t rewrite a recorded collection',
  format('update cod_transactions set collected_amount = 5 where shipment_id = %L', (select id from ship where label = 'k2')),
  '%recorded collection can''t be changed%');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000007c';
select t_check('customer gets nothing from the dashboard', (select count(*)::text from driver_cash_summary()), '0');
select t_fails('ATTACK: customer records a remittance',
  $$select record_driver_remittance('00000000-0000-0000-0000-00000000007a', 10, 'cash', current_date, null, null, gen_random_uuid())$$,
  '%Only operators and managers%');
reset role;
set role anon;
select t_fails('ATTACK: anonymous dashboard', $$select * from driver_cash_summary()$$, '%permission denied%');
reset role;

\echo '── Balances before any remittance ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000007e';
-- collected/remitted/outstanding/pending/expected/unverified
select t_check('A: 1,000 collected, 200 still expected, 75 unverified',
  t_pos('00000000-0000-0000-0000-00000000007a'), '1000.00/0.00/1000.00/0.00/200.00/75.00');
select t_check('B: nothing collected yet', t_pos('00000000-0000-0000-0000-00000000007b'), '0.00/0.00/0.00/0.00/50.00/0.00');

\echo '── Remittances ──'
select t_fails('ATTACK: operator inserts a remittance directly',
  $$insert into driver_cash_remittances (driver_id, amount, method, received_on, recorded_by, client_request_id, status, decided_by, decided_at)
    values ('00000000-0000-0000-0000-00000000007a', 600, 'cash', current_date, '00000000-0000-0000-0000-00000000007e', gen_random_uuid(), 'confirmed', '00000000-0000-0000-0000-00000000007e', now())$$,
  '%row-level security%');
select t_fails('amount must be positive',
  $$select record_driver_remittance('00000000-0000-0000-0000-00000000007a', 0, 'cash', current_date, null, null, gen_random_uuid())$$,
  '%greater than zero%');
select t_fails('at most two decimals',
  $$select record_driver_remittance('00000000-0000-0000-0000-00000000007a', 10.005, 'cash', current_date, null, null, gen_random_uuid())$$,
  '%two decimal%');
select t_fails('not more than owed',
  $$select record_driver_remittance('00000000-0000-0000-0000-00000000007a', 1000.01, 'cash', current_date, null, null, gen_random_uuid())$$,
  '%more than the driver owes%');
select t_fails('not for someone who isn''t a driver',
  $$select record_driver_remittance('00000000-0000-0000-0000-00000000007c', 10, 'cash', current_date, null, null, gen_random_uuid())$$,
  '%Driver not found%');
select t_fails('not dated in the future',
  $$select record_driver_remittance('00000000-0000-0000-0000-00000000007a', 10, 'cash', current_date + 3, null, null, gen_random_uuid())$$,
  '%future%');

-- The operator records AED 250 (pending), twice by accident.
select set_config('t.r1', record_driver_remittance('00000000-0000-0000-0000-00000000007a', 250, 'cash', current_date, 'R-1', null, '11111111-0000-4000-8000-000000000001')::text, false);
select t_check('a double submit returns the same remittance',
  record_driver_remittance('00000000-0000-0000-0000-00000000007a', 250, 'cash', current_date, 'R-1', null, '11111111-0000-4000-8000-000000000001')::text,
  current_setting('t.r1'));
select t_check('pending: recorded once, balance unchanged',
  (select count(*) || ' ' || t_pos('00000000-0000-0000-0000-00000000007a') from driver_cash_remittances),
  '1 1000.00/0.00/1000.00/250.00/200.00/75.00');
select t_fails('pending amounts count against what can still be recorded',
  $$select record_driver_remittance('00000000-0000-0000-0000-00000000007a', 750.01, 'cash', current_date, null, null, gen_random_uuid())$$,
  '%more than the driver owes%');
select t_fails('operator cannot confirm',
  format('select decide_driver_remittance(%L, %L)', current_setting('t.r1'), 'confirmed'), '%Only a manager%');

set request.jwt.uid = '00000000-0000-0000-0000-00000000007f';
select t_fails('rejection needs a reason',
  format('select decide_driver_remittance(%L, %L)', current_setting('t.r1'), 'rejected'), '%reason%');
select t_check('LEGITIMATE: manager rejects',
  decide_driver_remittance(current_setting('t.r1')::uuid, 'rejected', 'Cash count was AED 200, not 250'), 'rejected');
select t_check('rejected: balance unchanged, nothing pending',
  t_pos('00000000-0000-0000-0000-00000000007a'), '1000.00/0.00/1000.00/0.00/200.00/75.00');
select t_fails('a rejected remittance can''t then be confirmed',
  format('select decide_driver_remittance(%L, %L)', current_setting('t.r1'), 'confirmed'), '%already rejected%');

-- Operator records AED 350; the manager confirms (twice, by double click).
set request.jwt.uid = '00000000-0000-0000-0000-00000000007e';
select set_config('t.r2', record_driver_remittance('00000000-0000-0000-0000-00000000007a', 350, 'bank_transfer', current_date, 'TRX-9', 'End of shift', '11111111-0000-4000-8000-000000000002')::text, false);
set request.jwt.uid = '00000000-0000-0000-0000-00000000007f';
select t_check('LEGITIMATE: manager confirms', decide_driver_remittance(current_setting('t.r2')::uuid, 'confirmed'), 'confirmed');
select t_check('confirming twice is a no-op', decide_driver_remittance(current_setting('t.r2')::uuid, 'confirmed'), 'confirmed');
select t_check('confirmed 350: outstanding 650',
  t_pos('00000000-0000-0000-0000-00000000007a'), '1000.00/350.00/650.00/0.00/200.00/75.00');
select t_check('settled oldest-first, in full only (100 + 200 of 350)',
  (select string_agg(s.label || ':' || c.status, ',' order by s.label) from cod_transactions c join ship s on s.id = c.shipment_id
   where s.label in ('k1', 'k2', 'k3', 'k4')),
  'k1:reconciled,k2:reconciled,k3:collected,k4:collected');

-- A manager's own remittance is confirmed at once: AED 250 more = 600 in total.
select set_config('t.r3', record_driver_remittance('00000000-0000-0000-0000-00000000007a', 250, 'cash', current_date, null, null, '11111111-0000-4000-8000-000000000003')::text, false);
select t_check('worked example: 1,000 collected, 600 remitted, 400 outstanding, 200 to collect',
  t_pos('00000000-0000-0000-0000-00000000007a'), '1000.00/600.00/400.00/0.00/200.00/75.00');
select t_check('k3 settled once the credit covers it (50 + 250 ≥ 300)',
  (select status || ' ' || (remittance_id::text = current_setting('t.r3')) from cod_transactions where shipment_id = (select id from ship where label = 'k3')),
  'reconciled true');
select t_check('last remittance date', (select last_remittance_on::text from driver_cash_summary() where driver_id = '00000000-0000-0000-0000-00000000007a'), current_date::text);

\echo '── Per-shipment reconcile ──'
set request.jwt.uid = '00000000-0000-0000-0000-00000000007e';
select t_fails('verified cash can''t be reconciled shipment by shipment',
  format('update cod_transactions set status = %L, reconciled_by = %L, reconciled_at = now() where shipment_id = %L',
    'reconciled', '00000000-0000-0000-0000-00000000007e', (select id from ship where label = 'k4')),
  '%Record a driver remittance%');
update cod_transactions set status = 'reconciled', reconciled_by = '00000000-0000-0000-0000-00000000007e', reconciled_at = now()
where shipment_id = (select id from ship where label = 'k8');
select t_check('LEGITIMATE: an unverified legacy record still reconciles the old way',
  (select status || ' ' || coalesce(collected_amount::text, 'null') from cod_transactions where shipment_id = (select id from ship where label = 'k8')),
  'reconciled null');
select t_check('…and leaves the verified balance alone',
  t_pos('00000000-0000-0000-0000-00000000007a'), '1000.00/600.00/400.00/0.00/200.00/0.00');

\echo '── Records are permanent ──'
reset role;
select t_fails('ATTACK: change a confirmed remittance (even the service role)',
  format('update driver_cash_remittances set amount = 1 where id = %L', current_setting('t.r2')), '%only be confirmed or rejected once%');
select t_fails('ATTACK: delete a remittance (even the service role)',
  format('delete from driver_cash_remittances where id = %L', current_setting('t.r1')), '%can''t be deleted%');
select t_check('audit trail: recorded ×3, rejected, confirmed',
  (select string_agg(action, ',' order by action) from audit_logs where entity_type = 'driver_cash_remittance'),
  'driver_cash.remittance_confirmed,driver_cash.remittance_recorded,driver_cash.remittance_recorded,driver_cash.remittance_recorded,driver_cash.remittance_rejected');

\echo '── Totals and date ranges ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000007e';
select t_check('cards = sum of the rows',
  (select t.collected || '/' || t.remitted || '/' || t.outstanding || '/' || t.expected || '/' || t.drivers from driver_cash_totals() t),
  (select sum(collected) || '/' || sum(remitted) || '/' || sum(outstanding) || '/' || sum(expected) || '/' || count(*) from driver_cash_summary()));
select t_check('a past period shows no activity, but the same balance',
  (select collected_in_period || '/' || remitted_in_period || '/' || outstanding from driver_cash_summary(current_date - 20, current_date - 10)
   where driver_id = '00000000-0000-0000-0000-00000000007a'),
  '0.00/0.00/400.00');
select t_check('today''s activity',
  (select collected_in_period || '/' || remitted_in_period from driver_cash_summary(current_date - 1, current_date + 1)
   where driver_id = '00000000-0000-0000-0000-00000000007a'),
  '1000.00/600.00');
select t_check('search by driver name', (select string_agg(driver_name, ',') from driver_cash_summary(null, null, 'bilal')), 'Bilal Driver');
reset role;

\echo 'driver-cash: all checks passed'
