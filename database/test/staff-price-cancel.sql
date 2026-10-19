-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0046: operators and managers
-- changing a booked shipment's price and cancelling a shipment — who may,
-- validation, stale views, repeated requests, which shipments are
-- eligible, what happens to cash records, invoices, payments, the driver's
-- work and the bulk booking around it, the history, audit and
-- notifications, and that the plain-update route is closed for staff.
-- Each check raises "FAIL ..." on a wrong answer.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/staff-price-cancel.sql"

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

-- Operator (…8e), manager (…8f), customer (…8c), merchant (…8d), driver (…8a), driver 2 (…8b).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000008e', 'op8@test.com',   '{"full_name":"Op Eight","phone":"0508880001"}'),
  ('00000000-0000-0000-0000-00000000008f', 'mgr8@test.com',  '{"full_name":"Mgr Eight","phone":"0508880002"}'),
  ('00000000-0000-0000-0000-00000000008c', 'cust8@test.com', '{"full_name":"Cust Eight","phone":"0508880003"}'),
  ('00000000-0000-0000-0000-00000000008d', 'merch8@test.com','{"full_name":"Merch Eight","phone":"0508880006"}'),
  ('00000000-0000-0000-0000-00000000008a', 'drv8@test.com',  '{"full_name":"Drv Eight","phone":"0508880004"}'),
  ('00000000-0000-0000-0000-00000000008b', 'drv8b@test.com', '{"full_name":"Drv Eight B","phone":"0508880005"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000008e';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000008f';
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000008a', '00000000-0000-0000-0000-00000000008b');
update profiles set account_type = 'merchant' where id = '00000000-0000-0000-0000-00000000008d';
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000008e', 'EMP-P1'), ('00000000-0000-0000-0000-00000000008f', 'EMP-P2');

-- Shipments, written as the database (fixtures, not the paths under test).
-- Individual same-day pricing: base 12 + distance 9.60 = 21.60.
create temp table ship (label text primary key, id uuid);
grant select on ship to authenticated, anon;

create function t_ship(
  p_label text, p_payment text default 'card', p_postpaid numeric default 0,
  p_customer uuid default '00000000-0000-0000-0000-00000000008c', p_batch uuid default null
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into shipments (
    customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, recipient_payment_type, cod_amount, package_type, package_description, batch_id, package_weight_kg
  ) values (
    p_customer, 'confirmed', 'A', 25.09, 55.14, 'S', '0500000000',
    'B', 25.18, 55.27, 'R', '0500000001', 14.6, 25, null, 12, 9.60, 0, 0, 21.60,
    'AED', p_payment::payment_method,
    case when p_postpaid > 0 then 'postpaid' else 'prepaid' end::recipient_payment_type, p_postpaid,
    'parcel', p_label, p_batch, 1
  ) returning id into v_id;
  insert into ship values (p_label, v_id);
  return v_id;
end $$;

select t_ship('p_card');                          -- price edits, unassigned, card
select t_ship('p_cash', 'cod', 200);              -- cash fee + AED 200 goods, assigned
select t_ship('p_paid');                          -- fee already paid
select t_ship('p_deliv');                         -- delivered
select t_ship('p_coll', 'cod');                   -- driver already holds the fee
select t_ship('p_inv');                           -- has an issued invoice
select t_ship('p_free', 'cod');                   -- waived to AED 0
select t_ship('c_conf');                          -- cancel: confirmed, unassigned
select t_ship('c_asgn', 'cod', 50);               -- cancel: assigned, expected cash
select t_ship('c_pick', 'cod');                   -- cancel: arrived at pickup, fee collected
select t_ship('c_paid');                          -- cancel: fee paid by card
select t_ship('c_tran');                          -- in transit
select t_ship('c_fail');                          -- delivery failed
select t_ship('c_retd');                          -- returned
select t_ship('c_dlvd');                          -- delivered

-- A merchant bulk booking of two shipments.
insert into shipment_batches (id, name, customer_id, created_by, status) values
  ('80000000-0000-4000-8000-0000000000b1', 'Two parcels', '00000000-0000-0000-0000-00000000008d', '00000000-0000-0000-0000-00000000008d', 'processing');
select t_ship('b_one', 'card', 0, '00000000-0000-0000-0000-00000000008d', '80000000-0000-4000-8000-0000000000b1');
select t_ship('b_two', 'card', 0, '00000000-0000-0000-0000-00000000008d', '80000000-0000-4000-8000-0000000000b1');
update shipment_batches set status = 'submitted' where id = '80000000-0000-4000-8000-0000000000b1';

-- Assignment and driver progress, as the database.
update shipments set driver_id = '00000000-0000-0000-0000-00000000008a', status = 'assigned'
where id in (select id from ship where label in ('p_cash', 'p_free', 'p_coll', 'p_deliv', 'c_asgn', 'c_pick', 'c_tran', 'c_fail', 'c_retd', 'c_dlvd'));
update shipments set status = 'driver_accepted' where id in (select id from ship where label in ('p_coll', 'p_deliv', 'c_pick', 'c_tran', 'c_fail', 'c_retd', 'c_dlvd'));
update shipments set status = 'arrived_pickup' where id in (select id from ship where label in ('p_coll', 'p_deliv', 'c_pick', 'c_tran', 'c_fail', 'c_retd', 'c_dlvd'));
update shipments set status = 'picked_up' where id in (select id from ship where label in ('p_deliv', 'c_tran', 'c_fail', 'c_retd', 'c_dlvd'));
update shipments set status = 'in_transit' where id in (select id from ship where label in ('p_deliv', 'c_tran', 'c_fail', 'c_retd', 'c_dlvd'));
update shipments set status = 'delivery_failed' where id in (select id from ship where label in ('c_fail', 'c_retd'));
update shipments set status = 'returned' where id in (select id from ship where label = 'c_retd');
update shipments set status = 'arrived_destination' where id in (select id from ship where label in ('p_deliv', 'c_dlvd'));
update shipments set status = 'delivered' where id in (select id from ship where label in ('p_deliv', 'c_dlvd'));
-- The fee was paid (card), and a driver collected the sender's cash fee at pickup.
update shipments set payment_status = 'paid' where id in (select id from ship where label in ('p_paid', 'c_paid'));
insert into payments (shipment_id, customer_id, amount, method, status)
select id, '00000000-0000-0000-0000-00000000008c', 21.60, 'card', 'paid' from ship where label = 'c_paid';
update cod_transactions set status = 'collected' where shipment_id in (select id from ship where label in ('p_coll', 'c_pick'));

\echo '── Fixtures ──'
select t_check('the cash fee shipment expects goods + fee from the driver',
  (select amount || '/' || product_amount || '/' || delivery_fee_amount from cod_transactions where shipment_id = (select id from ship where label = 'p_cash')),
  '221.60/200.00/21.60');

-- The customer issues an invoice for p_inv.
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008c';
select issue_shipment_invoice((select id from ship where label = 'p_inv')) as inv_number \gset
reset role;

create temp table before_counts as
select
  (select count(*) from notifications where profile_id = '00000000-0000-0000-0000-00000000008c') as customer_notes,
  (select count(*) from notifications where profile_id = '00000000-0000-0000-0000-00000000008a') as driver_notes,
  (select active_count from driver_shipment_stats where driver_id = '00000000-0000-0000-0000-00000000008a') as driver_active;
grant select on before_counts to authenticated;

-- ════════════════════════════════════════════════════════════════════════
\echo '── Price: who may ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008c';
select t_fails('ATTACK: customer changes their own shipment price',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 1, 'I want a discount', gen_random_uuid()),
  '%Only operators and managers%');
select t_fails('ATTACK: customer updates the price column directly',
  format('update shipments set price = 1 where id = %L', (select id from ship where label = 'p_card')), '%');
select t_check('customer gets no action context', (select shipment_staff_actions((select id from ship where label = 'p_card')))::text, null);
set request.jwt.uid = '00000000-0000-0000-0000-00000000008a';
select t_fails('ATTACK: driver changes a price',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_cash'), 'assigned', 21.60, 99, 'Driver wants more', gen_random_uuid()),
  '%Only operators and managers%');
reset role;
set role anon;
select t_fails('ATTACK: anonymous call', $$select staff_adjust_shipment_price(gen_random_uuid(), 'confirmed', 1, 1, 'nope nope', gen_random_uuid())$$, '%permission denied%');
select t_fails('ATTACK: anonymous reads the action context', $$select shipment_staff_actions(gen_random_uuid())$$, '%permission denied%');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select t_fails('ATTACK: operator calls the internal block helper',
  format('select shipment_price_edit_block(%L)', (select id from ship where label = 'p_card')), '%permission denied%');
select t_fails('operator changes the price with a plain update (closed: no reason, no audit)',
  format('update shipments set price = 30 where id = %L', (select id from ship where label = 'p_card')), '%Edit price action%');
select t_fails('operator changes the COD amount with a plain update',
  format('update shipments set cod_amount = 1 where id = %L', (select id from ship where label = 'p_cash')), '%Edit price action%');
reset role;

\echo '── Price: validation ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select t_fails('reason required',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 30, '   ', gen_random_uuid()), '%reason for the price change%');
select t_fails('negative price',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, -5, 'Agreed rate', gen_random_uuid()), '%between AED 0 and AED 10,000%');
select t_fails('over the limit',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 10000.01, 'Agreed rate', gen_random_uuid()), '%between AED 0 and AED 10,000%');
select t_fails('NaN',
  format('select staff_adjust_shipment_price(%L, %L, %s, %L::numeric, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 'NaN', 'Agreed rate', gen_random_uuid()), '%between AED 0 and AED 10,000%');
select t_fails('Infinity',
  format('select staff_adjust_shipment_price(%L, %L, %s, %L::numeric, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 'Infinity', 'Agreed rate', gen_random_uuid()), '%between AED 0 and AED 10,000%');
select t_fails('three decimals',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 30.005, 'Agreed rate', gen_random_uuid()), '%two decimal places%');
select t_fails('missing request id',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, null)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 30, 'Agreed rate'), '%request id%');
select t_fails('stale price (operator saw another price)',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 20, 30, 'Agreed rate', gen_random_uuid()), '%reload and try again%');
select t_fails('stale status',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'assigned', 21.60, 30, 'Agreed rate', gen_random_uuid()), '%reload and try again%');
select t_fails('unchanged price',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 21.60, 'Agreed rate', gen_random_uuid()), '%unchanged%');
select t_fails('unknown shipment',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', gen_random_uuid(), 'confirmed', 21.60, 30, 'Agreed rate', gen_random_uuid()), '%Shipment not found%');
reset role;
select t_check('nothing changed by the refused attempts', (select price || '/' || price_adjustment from shipments where id = (select id from ship where label = 'p_card')), '21.60/0.00');

\echo '── Price: the change ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select t_check('action context: editable, cancellable, service charge 21.60',
  (select coalesce(a ->> 'priceEditBlock', 'null') || '|' || coalesce(a ->> 'cancelBlock', 'null') || '|' || (a ->> 'serviceCharge')
   from shipment_staff_actions((select id from ship where label = 'p_card')) a),
  'null|null|21.60');
select staff_adjust_shipment_price((select id from ship where label = 'p_card'), 'confirmed', 21.60, 30, 'Negotiated corporate rate', '80000000-0000-4000-8000-0000000000a1') ->> 'price' as new_price \gset
select t_check('returns the new price', :'new_price', '30.00');
select t_check('repeat of the same request: same answer, no second change',
  (select staff_adjust_shipment_price((select id from ship where label = 'p_card'), 'confirmed', 21.60, 30, 'Negotiated corporate rate', '80000000-0000-4000-8000-0000000000a1') ->> 'price'),
  '30.00');
reset role;
select t_check('price persisted; calculated components kept; adjustment recorded',
  (select price || '/' || base_charge || '/' || distance_charge || '/' || weight_charge || '/' || cod_charge || '/' || price_adjustment
   from shipments where id = (select id from ship where label = 'p_card')),
  '30.00/12.00/9.60/0.00/0.00/8.40');
select t_check('one audit row with old and new price, reason and actor',
  (select count(*) || '|' || max(old_value ->> 'price') || '|' || max(new_value ->> 'price') || '|' || max(new_value ->> 'reason') || '|' || max(actor_id::text) || '|' || max(new_value ->> 'field')
   from audit_logs where action = 'shipment.price_adjusted' and entity_id = (select id from ship where label = 'p_card')),
  '1|21.60|30.00|Negotiated corporate rate|00000000-0000-0000-0000-00000000008e|service_charge');
select t_check('one customer notification',
  (select count(*) || '|' || max(body) from notifications where profile_id = '00000000-0000-0000-0000-00000000008c' and type = 'shipment.price_adjusted'),
  '1|The delivery price for ' || (select tracking_number from shipments where id = (select id from ship where label = 'p_card')) || ' changed from AED 21.60 to AED 30.00.');
select t_check('no other shipment changed price',
  (select count(*)::text from shipments where id not in (select id from ship where label = 'p_card') and price <> 21.60), '0');

-- A second change builds on the first: the adjustment is cumulative.
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008f';
select t_fails('a stale second change (still thinks it is 21.60)',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_card'), 'confirmed', 21.60, 18, 'Discount instead', gen_random_uuid()), '%reload and try again%');
select staff_adjust_shipment_price((select id from ship where label = 'p_card'), 'confirmed', 30, 18, 'Manager discount instead', gen_random_uuid());
reset role;
select t_check('manager change: price 18, adjustment -3.60 against the calculated 21.60',
  (select price || '/' || price_adjustment from shipments where id = (select id from ship where label = 'p_card')), '18.00/-3.60');

\echo '── Price: cash on delivery ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select staff_adjust_shipment_price((select id from ship where label = 'p_cash'), 'assigned', 21.60, 25, 'Extra stairs at drop-off', gen_random_uuid());
reset role;
select t_check('the driver''s expected cash follows the new fee; goods money untouched (not double-counted)',
  (select amount || '/' || product_amount || '/' || delivery_fee_amount || '/' || status from cod_transactions where shipment_id = (select id from ship where label = 'p_cash')),
  '225.00/200.00/25.00/expected');
select t_check('the shipment''s COD principal is unchanged',
  (select cod_amount || '/' || recipient_payment_type || '/' || price from shipments where id = (select id from ship where label = 'p_cash')),
  '200.00/postpaid/25.00');

-- Waiving a cash fee entirely on an assigned shipment: nothing left to collect.
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select staff_adjust_shipment_price((select id from ship where label = 'p_free'), 'assigned', 21.60, 0, 'Goodwill after a complaint', gen_random_uuid());
reset role;
select t_check('a waived cash fee leaves no expected collection',
  (select count(*)::text from cod_transactions where shipment_id = (select id from ship where label = 'p_free')), '0');

\echo '── Price: money already moved, or closed ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select t_fails('fee already paid',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_paid'), 'confirmed', 21.60, 10, 'Agreed rate', gen_random_uuid()), '%already been paid%');
select t_fails('fee already collected in cash',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_coll'), 'arrived_pickup', 21.60, 10, 'Agreed rate', gen_random_uuid()), '%already collected%');
select t_fails('delivered shipment',
  format('select staff_adjust_shipment_price(%L, %L, %s, %s, %L, %L)', (select id from ship where label = 'p_deliv'), 'delivered', 21.60, 10, 'Agreed rate', gen_random_uuid()), '%delivered, cancelled or returned%');
select t_check('the context explains each block',
  (select string_agg(label || '=' || (shipment_staff_actions(id) ->> 'priceEditBlock'), ',' order by label) from ship where label in ('p_paid', 'p_coll', 'p_deliv', 'c_retd')),
  'c_retd=closed,p_coll=fee_collected,p_deliv=closed,p_paid=fee_paid');
reset role;
select t_check('the collected cash record is untouched',
  (select status || '/' || collected_amount from cod_transactions where shipment_id = (select id from ship where label = 'p_coll')), 'collected/21.60');

\echo '── Price: invoices ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select t_check('the context shows the live invoice',
  (select shipment_staff_actions((select id from ship where label = 'p_inv')) ->> 'invoiceNumber'), :'inv_number');
select staff_adjust_shipment_price((select id from ship where label = 'p_inv'), 'confirmed', 21.60, 15, 'Wrong distance at booking', gen_random_uuid()) -> 'voidedInvoices' ->> 0 as voided \gset
reset role;
select t_check('the old invoice is voided with the reason, its figures kept',
  (select status || '|' || total || '|' || (void_reason like '%Wrong distance at booking%')::text from invoices where invoice_number = :'inv_number'),
  'void|21.60|true');
select t_check('the function reports which invoice it voided', :'voided', :'inv_number');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008c';
select issue_shipment_invoice((select id from ship where label = 'p_inv')) as new_inv \gset
reset role;
select t_check('the customer issues a corrected invoice at the new price',
  (select total || '/' || subtotal || '/' || status from invoices where invoice_number = :'new_inv'), '15.00/15.00/issued');

\echo '── Price: bulk booking ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select staff_adjust_shipment_price((select id from ship where label = 'b_one'), 'confirmed', 21.60, 12, 'Merchant flat rate applies', gen_random_uuid());
reset role;
select t_check('only the edited shipment of the bulk booking changed',
  (select string_agg(label || '=' || s.price, ',' order by label) from ship join shipments s using (id) where label like 'b\_%'),
  'b_one=12.00,b_two=21.60');

-- ════════════════════════════════════════════════════════════════════════
\echo '── Cancel: who may ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008a';
select t_fails('ATTACK: driver uses the staff cancel',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_asgn'), 'assigned', 'Too far for me', gen_random_uuid()), '%Only operators and managers%');
set request.jwt.uid = '00000000-0000-0000-0000-00000000008c';
select t_fails('ATTACK: customer uses the staff cancel on a picked-up parcel',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_tran'), 'in_transit', 'Changed my mind', gen_random_uuid()), '%Only operators and managers%');
reset role;
set role anon;
select t_fails('ATTACK: anonymous cancel', $$select staff_cancel_shipment(gen_random_uuid(), 'confirmed', 'nope nope', gen_random_uuid())$$, '%permission denied%');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select t_fails('operator cancels with a plain update (closed: no reason, no audit)',
  format('update shipments set status = %L where id = %L', 'cancelled', (select id from ship where label = 'c_conf')), '%Cancel shipment action%');

\echo '── Cancel: eligibility ──'
select t_fails('reason required',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_conf'), 'confirmed', 'no', gen_random_uuid()), '%reason for the cancellation%');
select t_fails('stale status (driver moved it on)',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_tran'), 'assigned', 'Customer asked', gen_random_uuid()), '%reload and try again%');
select t_fails('picked up: must be returned',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_tran'), 'in_transit', 'Customer asked', gen_random_uuid()), '%return it to the sender%');
select t_fails('delivery failed: mark returned',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_fail'), 'delivery_failed', 'Customer asked', gen_random_uuid()), '%Mark it returned%');
select t_fails('delivered',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_dlvd'), 'delivered', 'Customer asked', gen_random_uuid()), '%Delivered shipments can''t be cancelled%');
select t_fails('returned',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_retd'), 'returned', 'Customer asked', gen_random_uuid()), '%Returned shipments%');
select t_check('the context agrees with every refusal',
  (select string_agg(label || '=' || coalesce(shipment_staff_actions(id) ->> 'cancelBlock', 'ok'), ',' order by label) from ship where label like 'c\_%'),
  'c_asgn=ok,c_conf=ok,c_dlvd=delivered,c_fail=delivery_failed,c_paid=ok,c_pick=ok,c_retd=returned,c_tran=picked_up');
reset role;

\echo '── Cancel: unassigned ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select staff_cancel_shipment((select id from ship where label = 'c_conf'), 'confirmed', 'Customer called to cancel', '80000000-0000-4000-8000-0000000000c1');
select t_check('the same request again changes nothing and succeeds',
  (select staff_cancel_shipment((select id from ship where label = 'c_conf'), 'confirmed', 'Customer called to cancel', '80000000-0000-4000-8000-0000000000c1') ->> 'status'), 'cancelled');
select t_fails('already cancelled (a new request)',
  format('select staff_cancel_shipment(%L, %L, %L, %L)', (select id from ship where label = 'c_conf'), 'cancelled', 'Customer called again', gen_random_uuid()), '%already cancelled%');
reset role;
select t_check('status and reason persisted',
  (select status || '|' || cancelled_reason from shipments where id = (select id from ship where label = 'c_conf')), 'cancelled|Customer called to cancel');
select t_check('history: one row, from confirmed, by the operator',
  (select count(*) || '|' || max(previous_status::text) || '|' || max(changed_by::text) from shipment_status_history
   where shipment_id = (select id from ship where label = 'c_conf') and status = 'cancelled'),
  '1|confirmed|00000000-0000-0000-0000-00000000008e');
select t_check('one audit row with the previous status, reason and actor',
  (select count(*) || '|' || max(old_value ->> 'status') || '|' || max(new_value ->> 'reason') || '|' || max(actor_id::text)
   from audit_logs where action = 'shipment.cancelled_by_staff' and entity_id = (select id from ship where label = 'c_conf')),
  '1|confirmed|Customer called to cancel|00000000-0000-0000-0000-00000000008e');
select t_check('one customer notification, naming operations',
  (select count(*) || '|' || max(body) from notifications where type = 'shipment.cancelled_by_operations' and profile_id = '00000000-0000-0000-0000-00000000008c'),
  '1|' || (select tracking_number from shipments where id = (select id from ship where label = 'c_conf')) || ' was cancelled by ParcelLink operations.');

\echo '── Cancel: assigned to a driver ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select staff_cancel_shipment((select id from ship where label = 'c_asgn'), 'assigned', 'Recipient no longer at address', gen_random_uuid());
reset role;
select t_check('driver assignment kept on the record',
  (select status || '|' || driver_id from shipments where id = (select id from ship where label = 'c_asgn')), 'cancelled|00000000-0000-0000-0000-00000000008a');
select t_check('the expected (uncollected) cash record is dropped',
  (select count(*)::text from cod_transactions where shipment_id = (select id from ship where label = 'c_asgn')), '0');
select t_check('the driver is told operations cancelled it — not the customer',
  (select count(*)::text from notifications where profile_id = '00000000-0000-0000-0000-00000000008a'
     and type = 'shipment.cancelled_by_operations' and body like '%no longer on your deliveries.'), '1');
select t_check('no "cancelled by the customer" message to the driver',
  (select count(*)::text from notifications where profile_id = '00000000-0000-0000-0000-00000000008a' and type = 'shipment.cancelled'), '0');
select t_check('the cancelled shipment left the driver''s active count',
  (select (b.driver_active - s.active_count)::text from before_counts b, driver_shipment_stats s where s.driver_id = '00000000-0000-0000-0000-00000000008a'), '1');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008a';
select t_check('the driver still sees it (history), as cancelled',
  (select status::text from shipments where id = (select id from ship where label = 'c_asgn')), 'cancelled');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select t_fails('a cancelled shipment cannot be reassigned',
  format('update shipments set driver_id = %L, status = %L where id = %L', '00000000-0000-0000-0000-00000000008b', 'assigned', (select id from ship where label = 'c_asgn')),
  '%Invalid shipment status transition%');
reset role;

\echo '── Cancel: money already moved ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008f';
select staff_cancel_shipment((select id from ship where label = 'c_pick'), 'arrived_pickup', 'Sender cancelled at the door', gen_random_uuid()) ->> 'cashCollected' as cash \gset
select staff_cancel_shipment((select id from ship where label = 'c_paid'), 'confirmed', 'Duplicate booking', gen_random_uuid()) ->> 'refundRequired' as refund \gset
reset role;
select t_check('collected cash is reported', :'cash', '21.60');
select t_check('the collected record stays in the driver''s balance',
  (select status || '/' || collected_amount from cod_transactions where shipment_id = (select id from ship where label = 'c_pick')), 'collected/21.60');
select t_check('a paid fee is flagged as needing a refund', :'refund', 'true');
select t_check('the payment is not marked refunded and its record is intact',
  (select s.payment_status || '|' || count(p.*) || '|' || max(p.status::text) from shipments s left join payments p on p.shipment_id = s.id
   where s.id = (select id from ship where label = 'c_paid') group by s.payment_status),
  'paid|1|paid');

\echo '── Cancel: bulk booking ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
select staff_cancel_shipment((select id from ship where label = 'b_two'), 'confirmed', 'Merchant removed this parcel', gen_random_uuid());
reset role;
select t_check('only that shipment of the bulk booking is cancelled',
  (select string_agg(label || '=' || s.status, ',' order by label) from ship join shipments s using (id) where label like 'b\_%'),
  'b_one=confirmed,b_two=cancelled');
select t_check('the bulk booking itself is unchanged',
  (select status from shipment_batches where id = '80000000-0000-4000-8000-0000000000b1'), 'submitted');

\echo '── Customers keep their own cancel ──'
select t_ship('cust_cancel');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008c';
update shipments set status = 'cancelled' where id = (select id from ship where label = 'cust_cancel');
reset role;
select t_check('customer self-cancel still works',
  (select status::text from shipments where id = (select id from ship where label = 'cust_cancel')), 'cancelled');

\echo '── Audit is not writable by staff ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000008e';
-- No delete policy: refused or a no-op, depending on the table grants.
do $$ begin
  delete from audit_logs where action in ('shipment.price_adjusted', 'shipment.cancelled_by_staff');
exception when others then null;
end $$;
do $$ begin
  update audit_logs set new_value = '{}' where action in ('shipment.price_adjusted', 'shipment.cancelled_by_staff');
exception when others then null;
end $$;
reset role;
select t_check('audit rows intact (ATTACK: operator deletes or rewrites them)',
  (select count(*) || '|' || count(*) filter (where new_value = '{}') from audit_logs where action in ('shipment.price_adjusted', 'shipment.cancelled_by_staff')), '11|0');
