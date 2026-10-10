-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0041: operators and managers
-- correcting a status a driver set by mistake — who may, which moves, the
-- reason, stale views, the history trail, notifications, and that delivered
-- / cancelled / returned shipments keep their evidence. Each check raises
-- "FAIL ..." on a wrong answer.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/status-corrections.sql"

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

-- Operator (…6e), manager (…6f), customer (…6c), driver (…6a), other driver (…6b).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000006e', 'op6@test.com',   '{"full_name":"Op Six","phone":"0506660001"}'),
  ('00000000-0000-0000-0000-00000000006f', 'mgr6@test.com',  '{"full_name":"Mgr Six","phone":"0506660002"}'),
  ('00000000-0000-0000-0000-00000000006c', 'cust6@test.com', '{"full_name":"Cust Six","phone":"0506660003"}'),
  ('00000000-0000-0000-0000-00000000006a', 'drv6@test.com',  '{"full_name":"Drv Six","phone":"0506660004"}'),
  ('00000000-0000-0000-0000-00000000006b', 'drv6b@test.com', '{"full_name":"Drv Six B","phone":"0506660005"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000006e';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000006f';
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000006a', '00000000-0000-0000-0000-00000000006b');
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000006e', 'EMP-C1'), ('00000000-0000-0000-0000-00000000006f', 'EMP-C2');

-- c1..c5: the customer's shipments, assigned to driver …6a by the operator.
create temp table ship (label text primary key, id uuid);
grant select on ship to authenticated, anon;
do $$
declare v_rule uuid; v_id uuid; n int;
begin
  select id into v_rule from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual';
  for n in 1..5 loop
    insert into shipments (
      customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
      dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
      distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price,
      currency, payment_method, package_type, package_description
    ) values (
      '00000000-0000-0000-0000-00000000006c', 'confirmed', 'A', 25.09, 55.14, 'S', '0500000000',
      'B', 25.18, 55.27, 'R', '0500000001', 14.6, 25, v_rule, 12, 9.60, 0, 0, 21.60, 'AED', 'card', 'parcel', 'c' || n
    ) returning id into v_id;
    insert into ship values ('c' || n, v_id);
  end loop;
end $$;

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
update shipments set driver_id = '00000000-0000-0000-0000-00000000006a', status = 'assigned' where id in (select id from ship);

-- The driver's real progress: c1 is tapped through to "in transit" by
-- mistake (the parcel never left); c2 genuinely is in transit.
set request.jwt.uid = '00000000-0000-0000-0000-00000000006a';
update shipments set status = 'driver_accepted' where id in (select id from ship where label in ('c1', 'c2', 'c3', 'c4'));
update shipments set status = 'arrived_pickup' where id in (select id from ship where label in ('c1', 'c2', 'c3', 'c4'));
update shipments set status = 'picked_up' where id in (select id from ship where label in ('c1', 'c2', 'c3', 'c4'));
update shipments set status = 'in_transit' where id in (select id from ship where label in ('c1', 'c2', 'c3', 'c4'));

reset role;
create temp table before_counts as
select
  (select count(*) from notifications where profile_id = '00000000-0000-0000-0000-00000000006c') as customer_notes,
  (select count(*) from shipment_status_history where shipment_id = (select id from ship where label = 'c1')) as c1_history;
grant select on before_counts to authenticated;

\echo '── Who may correct ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006c';
select t_fails('ATTACK: customer corrects a status',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c1'), 'in_transit', 'arrived_pickup', 'I want it back'),
  '%Only operators and managers%');
set request.jwt.uid = '00000000-0000-0000-0000-00000000006a';
select t_fails('ATTACK: driver corrects their own status',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c1'), 'in_transit', 'arrived_pickup', 'Undo my tap'),
  '%Only operators and managers%');
reset role;
set role anon;
select t_fails('ATTACK: anonymous call', $$select correct_shipment_status(gen_random_uuid(), 'in_transit', 'assigned', 'nope nope')$$, '%permission denied%');
reset role;

\echo '── Validation ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select t_fails('reason required',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c1'), 'in_transit', 'arrived_pickup', '  '),
  '%reason%');
select t_fails('stale view (status moved on)',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c1'), 'picked_up', 'arrived_pickup', 'Driver tapped too early'),
  '%reload it before correcting%');
select t_fails('cannot correct to delivered',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c1'), 'in_transit', 'delivered', 'Driver tapped too early'),
  '%proof of delivery%');
select t_fails('cannot correct to an unlisted status (confirmed)',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c1'), 'in_transit', 'confirmed', 'Driver tapped too early'),
  '%can''t be corrected from in_transit to confirmed%');
select t_fails('same status is not a correction',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c1'), 'in_transit', 'in_transit', 'Driver tapped too early'),
  '%already has this status%');
select t_fails('ATTACK: operator moves a status backwards directly',
  format('update shipments set status = %L where id = %L', 'arrived_pickup', (select id from ship where label = 'c1')),
  '%Invalid shipment status transition%');
select t_fails('ATTACK: client sets the correction flag itself',
  format($f$select set_config('app.status_correction_reason', 'sneaky', true); update shipments set status = 'arrived_pickup' where id = %L$f$, (select id from ship where label = 'c1')),
  '%Invalid shipment status transition%');

\echo '── The correction ──'
select t_check('LEGITIMATE: in transit corrected to arrived at pickup',
  correct_shipment_status((select id from ship where label = 'c1'), 'in_transit', 'arrived_pickup', 'Driver marked In Transit before pickup')::text,
  'arrived_pickup');
select t_fails('repeat click is stale, not applied twice',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c1'), 'in_transit', 'arrived_pickup', 'Driver marked In Transit before pickup'),
  '%reload it before correcting%');
reset role;
select t_check('c2 (a genuine in-transit) is untouched', (select status::text from shipments where id = (select id from ship where label = 'c2')), 'in_transit');
select t_check('history keeps the mistaken rows and adds one correction',
  (select count(*)::text from shipment_status_history where shipment_id = (select id from ship where label = 'c1')),
  ((select c1_history from before_counts) + 1)::text);
select t_check('correction row: from, to, who, why',
  (select previous_status || '>' || status || ' ' || event_type || ' ' || changed_by || ' ' || note
   from shipment_status_history where shipment_id = (select id from ship where label = 'c1') and event_type = 'correction'),
  'in_transit>arrived_pickup correction 00000000-0000-0000-0000-00000000006e Driver marked In Transit before pickup');
select t_check('the mistaken in-transit row is still there',
  (select count(*)::text from shipment_status_history where shipment_id = (select id from ship where label = 'c1') and status = 'in_transit' and event_type = 'transition'),
  '1');
select t_check('no customer notification for the correction',
  (select count(*)::text from notifications where profile_id = '00000000-0000-0000-0000-00000000006c'),
  (select customer_notes::text from before_counts));
select t_check('driver told about the correction',
  (select count(*)::text from notifications where profile_id = '00000000-0000-0000-0000-00000000006a' and type = 'shipment.status_corrected'), '1');
select t_check('audit log written',
  (select new_value->>'reason' from audit_logs where action = 'shipment.status_correction' and entity_id = (select id from ship where label = 'c1')),
  'Driver marked In Transit before pickup');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006a';
update shipments set status = 'picked_up' where id = (select id from ship where label = 'c1');
select t_check('LEGITIMATE: the driver carries on from the corrected status',
  (select status::text from shipments where id = (select id from ship where label = 'c1')), 'picked_up');

\echo '── Assigned → In transit, corrected back to Assigned ──'
set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select t_check('LEGITIMATE: corrected to assigned',
  correct_shipment_status((select id from ship where label = 'c3'), 'in_transit', 'assigned', 'Parcel never left the pickup point')::text, 'assigned');
set request.jwt.uid = '00000000-0000-0000-0000-00000000006a';
update shipments set status = 'driver_accepted' where id = (select id from ship where label = 'c3');
select t_check('LEGITIMATE: driver accepts again', (select status::text from shipments where id = (select id from ship where label = 'c3')), 'driver_accepted');

\echo '── Delivered, cancelled and returned ──'
reset role;
insert into storage.objects (bucket_id, name) values ('proof-of-delivery', (select id from ship where label = 'c2')::text || '/pod.jpg');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006a';
update shipments set status = 'arrived_destination' where id = (select id from ship where label = 'c2');
select complete_delivery((select id from ship where label = 'c2'), null, (select id from ship where label = 'c2')::text || '/pod.jpg', null, null, null, 'At reception', false);
set request.jwt.uid = '00000000-0000-0000-0000-00000000006f';
select t_fails('delivered shipments are not correctable (even by a manager)',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c2'), 'delivered', 'arrived_destination', 'Wrong recipient maybe'),
  '%proof of delivery%');
reset role;
select t_check('proof of delivery intact', (select count(*)::text from proof_of_delivery where shipment_id = (select id from ship where label = 'c2')), '1');

-- c4: the driver returns it (with a photo); c5: the driver cancels before pickup.
insert into storage.objects (bucket_id, name) values
  ('proof-of-delivery', (select id from ship where label = 'c4')::text || '/ret.jpg'),
  ('proof-of-delivery', (select id from ship where label = 'c5')::text || '/can.jpg');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000006a';
select driver_return_shipment((select id from ship where label = 'c4'), 'Recipient unreachable', (select id from ship where label = 'c4')::text || '/ret.jpg');
update shipments set status = 'driver_accepted' where id = (select id from ship where label = 'c5');
select driver_cancel_shipment((select id from ship where label = 'c5'), 'Wrong tap', (select id from ship where label = 'c5')::text || '/can.jpg');

set request.jwt.uid = '00000000-0000-0000-0000-00000000006e';
select t_fails('operator cannot re-open a returned shipment',
  format('select correct_shipment_status(%L, %L, %L, %L)', (select id from ship where label = 'c4'), 'returned', 'in_transit', 'Recipient answered after all'),
  '%Only a manager%');
set request.jwt.uid = '00000000-0000-0000-0000-00000000006f';
select t_check('LEGITIMATE: manager re-opens the returned shipment',
  correct_shipment_status((select id from ship where label = 'c4'), 'returned', 'in_transit', 'Recipient answered after all')::text, 'in_transit');
reset role;
select t_check('return reason and photo kept',
  (select delivery_failed_reason || ' / ' || (select count(*) from shipment_outcome_proofs where shipment_id = s.id)
   from shipments s where id = (select id from ship where label = 'c4')),
  'Recipient unreachable / 1');
select t_check('cancel reason kept on the cancelled shipment',
  (select status || ' ' || cancelled_reason from shipments where id = (select id from ship where label = 'c5')),
  'cancelled Wrong tap');

\echo '── Public tracking ──'
select set_config('t.code', (select tracking_number from shipments where id = (select id from ship where label = 'c1')), false);
set role anon;
select t_check('public history marks the correction, without the reason or who made it',
  (select string_agg(event_type, ',' order by created_at) filter (where event_type = 'correction')
   from get_shipment_tracking_history(current_setting('t.code'))),
  'correction');
reset role;
select t_check('public history returns no notes or people',
  (select string_agg(p.name, ',' order by p.ordinal) from (
     select unnest(proargnames) as name, generate_subscripts(proargnames, 1) as ordinal
     from pg_proc where proname = 'get_shipment_tracking_history') p
   where p.name <> 'p_tracking_number'),
  'status,created_at,event_type');

\echo 'status-corrections: all checks passed'
