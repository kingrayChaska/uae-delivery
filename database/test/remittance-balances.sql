-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). The remittance acceptance cases, end to end through
-- the functions the dashboards call (0042/0048/0049): a driver who holds
-- AED 2,500 and has it all confirmed is at AED 0.00; one whose operator
-- counts AED 2,000 of 2,500 still owes AED 500; submitting alone never
-- clears anything; older weeks carry forward; the operator is accountable
-- only for cash they confirmed, and reaches AED 0.00 only when the manager
-- has confirmed all of it; every submission, count and confirmation stays
-- readable; collections and shipment payment states are never touched; and
-- every dashboard reads the same balance. Each check raises "FAIL ...".
--
-- Not covered here: truly concurrent sessions (this runs in one session).
-- Every balance-changing function takes the per-person advisory lock before
-- reading the balance (pg_advisory_xact_lock in 0042/0048) — checked below
-- by reading the function bodies.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/remittance-balances.sql"

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

-- Operator (…6e), manager (…6f), drivers (…6a full, …6b partial, …6d old week), customer (…6c).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000006e', 'op6@test.com',   '{"full_name":"Op Six","phone":"0506660001"}'),
  ('00000000-0000-0000-0000-00000000006f', 'mgr6@test.com',  '{"full_name":"Mgr Six","phone":"0506660002"}'),
  ('00000000-0000-0000-0000-00000000006a', 'drv6a@test.com', '{"full_name":"Drv Full","phone":"0506660004"}'),
  ('00000000-0000-0000-0000-00000000006b', 'drv6b@test.com', '{"full_name":"Drv Partial","phone":"0506660005"}'),
  ('00000000-0000-0000-0000-00000000006d', 'drv6d@test.com', '{"full_name":"Drv Old","phone":"0506660006"}'),
  ('00000000-0000-0000-0000-00000000006c', 'cust6@test.com', '{"full_name":"Cust Six","phone":"0506660003"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000006e';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000006f';
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000006a', '00000000-0000-0000-0000-00000000006b', '00000000-0000-0000-0000-00000000006d');
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000006e', 'EMP-B1'), ('00000000-0000-0000-0000-00000000006f', 'EMP-B2');
insert into driver_profiles (profile_id, driver_code, license_number) values
  ('00000000-0000-0000-0000-00000000006a', 'DRV-61', 'L-61'), ('00000000-0000-0000-0000-00000000006b', 'DRV-62', 'L-62'),
  ('00000000-0000-0000-0000-00000000006d', 'DRV-63', 'L-63');

create temp table ship (label text primary key, id uuid);
grant select on ship to authenticated, anon;

-- One delivered shipment per driver: AED 100 cash fee + AED 2,400 goods
-- (AED 2,500 in cash), or AED 300 for the old-week driver; collected by them.
create function t_delivered(p_label text, p_driver uuid, p_fee numeric, p_goods numeric) returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into shipments (
    customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, recipient_payment_type, cod_amount, package_type, package_description
  ) values (
    '00000000-0000-0000-0000-00000000006c', 'confirmed', 'A', 25.09, 55.14, 'S', '0500000000',
    'B', 25.18, 55.27, 'R', '0500000001', 5, 10, p_fee, 0, 0, 0, p_fee,
    'AED', 'cod', 'postpaid', p_goods, 'parcel', p_label
  ) returning id into v_id;
  insert into ship values (p_label, v_id);
  update shipments set driver_id = p_driver, status = 'assigned' where id = v_id;
  update shipments set status = 'driver_accepted' where id = v_id;
  update shipments set status = 'arrived_pickup' where id = v_id;
  update shipments set status = 'picked_up' where id = v_id;
  update shipments set status = 'in_transit' where id = v_id;
  update shipments set status = 'arrived_destination' where id = v_id;
  update shipments set status = 'delivered' where id = v_id;
  -- The driver's session, for this statement's transaction only.
  perform set_config('request.jwt.uid', p_driver::text, true);
  update cod_transactions set status = 'collected' where shipment_id = v_id;
end $$;

select t_delivered('full', '00000000-0000-0000-0000-00000000006a', 100, 2400);
select t_delivered('part', '00000000-0000-0000-0000-00000000006b', 100, 2400);
select t_delivered('old', '00000000-0000-0000-0000-00000000006d', 50, 250);
update cod_transactions set collected_at = now() - interval '21 days' where shipment_id = (select id from ship where label = 'old');

-- What the dashboards read for a driver, side by side: the driver's cash
-- page, the staff cash list (0042), and the operator's driver details (0049).
create function t_driver_balances(p_driver uuid) returns text language sql as $$
  select (driver_cash_overview(p_driver) ->> 'outstanding')
    || '|' || (select outstanding::text from driver_cash_summary() where driver_id = p_driver)
    || '|' || (staff_driver_overview(p_driver) #>> '{now,outstanding}');
$$;
grant execute on function t_driver_balances(uuid) to authenticated;

select t_check('collections recorded: 2,500 / 2,500 / 300',
  (select string_agg(s.label || '=' || c.collected_amount, ',' order by s.label) from cod_transactions c join ship s on s.id = c.shipment_id),
  'full=2500.00,old=300.00,part=2500.00');

-- ════════════════════════════════════════════════════════════════════════
\echo '── Driver → operator: the whole AED 2,500 ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006a';
select submit_driver_remittance(2400, 100, 'Week''s cash', gen_random_uuid()) ->> 'number' as full_r \gset
select t_check('submitted, not yet confirmed: still AED 2,500 outstanding, all of it reserved',
  (select (o ->> 'outstanding') || '|' || (o ->> 'available') || '|' || (o ->> 'pendingCount') from driver_cash_overview() o), '2500.00|0.00|1');
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select t_check('every dashboard agrees before confirmation', t_driver_balances('00000000-0000-0000-0000-00000000006a'), '2500.00|2500.00|2500.00');
select t_check('the operator is NOT yet accountable for a pending submission',
  (select (o ->> 'outstanding') from operator_cash_overview() o), '0.00');
select t_check('confirmation leaves the driver at AED 0.00',
  confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'full_r'), 2400, 100, 'Counted') ->> 'driverOutstanding', '0.00');
select t_check('every dashboard agrees after confirmation', t_driver_balances('00000000-0000-0000-0000-00000000006a'), '0.00|0.00|0.00');
select t_check('a repeated confirmation deducts nothing more',
  (confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'full_r'), 2400, 100, 'Counted') ->> 'status')
    || '|' || t_driver_balances('00000000-0000-0000-0000-00000000006a'), 'confirmed|0.00|0.00|0.00');
select t_check('the operator now holds exactly that AED 2,500, COD and fees apart',
  (select (o ->> 'outstanding') || '|' || (o ->> 'outstandingCod') || '|' || (o ->> 'outstandingFee') from operator_cash_overview() o),
  '2500.00|2400.00|100.00');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006a';
select t_check('nothing left to submit', (select (o ->> 'available') from driver_cash_overview() o), '0.00');
select t_fails('a second submission of the same cash is refused',
  $$select submit_driver_remittance(0.01, 0, null, gen_random_uuid())$$, '%more COD than you hold%');
select t_check('the driver still sees the record: number, amounts, status, who confirmed, when',
  (select remittance_number || '|' || amount || '|' || cod_amount || '|' || fee_amount || '|' || status || '|' || decided_by_name
     || '|' || (decided_at is not null)::text || '|' || (created_at is not null)::text || '|' || received_by_role || '|' || recorded_by_name
   from driver_remittance_history()),
  :'full_r' || '|2500.00|2400.00|100.00|confirmed|Op Six|true|true|operator|Drv Full');
reset role;

\echo '── Driver → operator: AED 2,000 counted of 2,500 ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006b';
select submit_driver_remittance(2400, 100, null, gen_random_uuid()) ->> 'number' as part_r \gset
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select t_check('counting AED 2,000 leaves AED 500 with the driver',
  confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'part_r'), 1900, 100, 'Envelope held AED 2,000')
    ->> 'driverOutstanding', '500.00');
select t_check('every dashboard says AED 500', t_driver_balances('00000000-0000-0000-0000-00000000006b'), '500.00|500.00|500.00');
select t_check('the AED 500 is COD (the fee was counted in full)',
  (select (o ->> 'outstandingCod') || '|' || (o ->> 'outstandingFee') from driver_cash_overview('00000000-0000-0000-0000-00000000006b') o), '500.00|0.00');
reset role;
select t_check('the submission is kept as submitted (disputed, AED 2,500); what was counted is its own confirmed record',
  (select string_agg(status || ':' || amount || ':' || (discrepancy_of is not null)::text, ',' order by created_at)
   from driver_cash_remittances where driver_id = '00000000-0000-0000-0000-00000000006b'),
  'disputed:2500.00:false,confirmed:2000.00:true');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006b';
select submit_driver_remittance(500, 0, 'The rest', gen_random_uuid()) ->> 'number' as rest_r \gset
select t_check('the rest submitted: still AED 500 until confirmed', (select (o ->> 'outstanding') from driver_cash_overview() o), '500.00');
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select t_check('…then AED 0.00',
  confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'rest_r'), 500, 0, null) ->> 'driverOutstanding', '0.00');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006b';
select t_check('three records, all still readable by the driver',
  (select string_agg(status || ':' || amount || ':' || coalesce(counted_amount::text, '-'), ',' order by created_at) from driver_remittance_history()),
  'disputed:2500.00:2000.00,confirmed:2000.00:-,confirmed:500.00:-');
reset role;

\echo '── An older week carries forward ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006d';
select t_check('collected three weeks ago, never remitted: still AED 300 now, and this week opens with it',
  (select (o ->> 'outstanding') || '|' || (o ->> 'openingOutstanding') || '|' || ((o -> 'week') ->> 'collectedCod') from driver_cash_overview() o),
  '300.00|300.00|0.00');
select t_check('each week since closes at AED 300 (nothing reset)',
  (select string_agg(closing::text, ',' order by week_start) from driver_cash_weeks(null, 3)), '300.00,300.00,300.00');
reset role;

-- ════════════════════════════════════════════════════════════════════════
\echo '── Operator → manager ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select t_check('the operator holds 2,500 + 2,000 + 500 confirmed from drivers; the old-week AED 300 is still the driver''s',
  (select (o ->> 'outstanding') || '|' || (o ->> 'receivedCod') || '|' || (o ->> 'receivedFee') from operator_cash_overview() o),
  '5000.00|4800.00|200.00');
select submit_operator_remittance(4800, 200, 'Weekly handover', gen_random_uuid()) ->> 'number' as op_r \gset
select t_check('submitted, not confirmed: the operator still owes AED 5,000',
  (select (o ->> 'outstanding') || '|' || (o ->> 'availableCod') || '|' || (o ->> 'availableFee') from operator_cash_overview() o), '5000.00|0.00|0.00');
set request.jwt.uid = '00000000-0000-0000-0000-00000000006f';
select t_check('the manager hasn''t received it yet', (select (t ->> 'fromOperators')::numeric || '|' || (t ->> 'pendingFromOperators') from manager_cash_totals() t),
  '0|5000.00');
select t_check('the manager counts AED 4,000: AED 1,000 stays with the operator',
  confirm_operator_remittance((select id from operator_cash_remittances where remittance_number = :'op_r'), 3800, 200, 'Short by AED 1,000')
    ->> 'operatorOutstanding', '1000.00');
select t_check('the manager''s per-operator balance agrees',
  (select outstanding || '/' || remitted from operator_cash_balances() where operator_id = '00000000-0000-0000-0000-00000000006e'), '1000.00/4000.00');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select submit_operator_remittance(1000, 0, 'Balance', gen_random_uuid()) ->> 'number' as op_rest \gset
set request.jwt.uid = '00000000-0000-0000-0000-00000000006f';
select t_check('…the rest confirmed: AED 0.00',
  confirm_operator_remittance((select id from operator_cash_remittances where remittance_number = :'op_rest'), 1000, 0, null) ->> 'operatorOutstanding', '0.00');
select t_check('a repeated confirmation changes nothing',
  (confirm_operator_remittance((select id from operator_cash_remittances where remittance_number = :'op_rest'), 1000, 0, null) ->> 'status')
    || '|' || (select outstanding::text from operator_cash_balances() where operator_id = '00000000-0000-0000-0000-00000000006e'), 'confirmed|0.00');
select t_check('the manager has received AED 5,000 — COD 4,800 and fees 200 — once',
  (select (t ->> 'fromOperators') || '|' || (t ->> 'fromOperatorsCod') || '|' || (t ->> 'fromOperatorsFee') || '|' || (t ->> 'heldByOperators')
     || '|' || (t ->> 'heldByDrivers') from manager_cash_totals() t),
  '5000.00|4800.00|200.00|0.00|300.00');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select t_check('the operator''s history keeps every step',
  (select string_agg(status || ':' || amount || ':' || coalesce(decided_by_name, '-'), ',' order by created_at) from operator_remittance_history()),
  'disputed:5000.00:Mgr Six,confirmed:4000.00:Mgr Six,confirmed:1000.00:Mgr Six');
reset role;

\echo '── Nothing else was touched ──'
select t_check('collections are kept, amounts unchanged',
  (select count(*) || '|' || sum(collected_amount) from cod_transactions where collected_amount is not null), '3|5300.00');
select t_check('remittances never change a shipment''s payment status',
  (select string_agg(distinct payment_status::text, ',') from shipments where id in (select id from ship)), 'pending');
select t_fails('a confirmed remittance can''t be edited', format('update driver_cash_remittances set amount = 1 where remittance_number = %L', :'full_r'),
  '%only be confirmed or rejected once%');
select t_fails('nor deleted', format('delete from operator_cash_remittances where remittance_number = %L', :'op_r'), '%can''t be deleted%');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006f';
select t_check('every dirham collected is in exactly one place',
  (select ((t ->> 'fromOperators')::numeric + (t ->> 'directFromDrivers')::numeric + (t ->> 'heldByOperators')::numeric + (t ->> 'heldByDrivers')::numeric)::text
   from manager_cash_totals() t),
  '5300.00');
reset role;

\echo '── Every balance change is serialised ──'
select t_check('submit and confirm (driver and operator) lock the balance before reading it',
  (select string_agg(p.proname || '=' || (position('pg_advisory_xact_lock' in p.prosrc) between 1 and position('_cash_breakdown(' in p.prosrc))::text, ',' order by p.proname)
   from pg_proc p where p.proname in ('submit_driver_remittance', 'confirm_driver_remittance', 'submit_operator_remittance', 'confirm_operator_remittance')),
  'confirm_driver_remittance=true,confirm_operator_remittance=true,submit_driver_remittance=true,submit_operator_remittance=true');

\echo 'remittance-balances: all checks passed'
