-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0050: merchant COD shipments have no
-- fee; non-COD Next-Day bookings of 2–4 / 5+ are AED 20 / AED 15 flat; other
-- cases keep the merchant rule, flagged; the database sets the price
-- whatever the request claims, and the final tier when a booking is
-- finalized (cancellations before it count, after it don't); a merchant fee
-- is never driver cash — the driver's record is the COD amount, remitted in
-- full with nothing deducted; individual customers are unchanged; repeats
-- change nothing; nobody can flip the tier by hand. Each check raises
-- "FAIL ...".
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/merchant-fee-policy.sql"

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

-- Merchants (…4a, …4b), individual (…4c), driver (…4d), operator (…4e), manager (…4f).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000004a', 'm4@test.com',  '{"full_name":"Merchant Four","phone":"0504440001"}'),
  ('00000000-0000-0000-0000-00000000004b', 'm4b@test.com', '{"full_name":"Merchant Four B","phone":"0504440002"}'),
  ('00000000-0000-0000-0000-00000000004c', 'c4@test.com',  '{"full_name":"Cust Four","phone":"0504440003"}'),
  ('00000000-0000-0000-0000-00000000004d', 'd4@test.com',  '{"full_name":"Drv Four","phone":"0504440004"}'),
  ('00000000-0000-0000-0000-00000000004e', 'o4@test.com',  '{"full_name":"Op Four","phone":"0504440005"}'),
  ('00000000-0000-0000-0000-00000000004f', 'g4@test.com',  '{"full_name":"Mgr Four","phone":"0504440006"}');
alter table profiles disable trigger user;
update profiles set account_type = 'merchant' where id in ('00000000-0000-0000-0000-00000000004a', '00000000-0000-0000-0000-00000000004b');
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-00000000004d';
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000004e';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-00000000004f';
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-00000000004e', 'EMP-F1'), ('00000000-0000-0000-0000-00000000004f', 'EMP-F2');

create temp table ship (label text primary key, id uuid);
grant select, insert on ship to authenticated, anon;

-- A booking as the signed-in caller (RLS and every trigger apply). A single
-- booking must state the policy price; a batch row claims AED 1 and a
-- forged tier — the database prices it anyway.
create function t_book(p_label text, p_customer uuid, p_type text, p_cod numeric, p_batch uuid default null,
  p_weight numeric default 30, p_price numeric default 1, p_request uuid default null)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into shipments (
    customer_id, status, batch_id, client_request_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, pricing_rule_id, delivery_type, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, recipient_payment_type, cod_amount, package_type, package_description, package_weight_kg,
    merchant_fee_tier, fee_billed
  ) values (
    p_customer, 'confirmed', p_batch, p_request, 'A', 25.09, 55.14, 'S', '0500000000', 'B', 25.18, 55.27, 'R', '0500000001',
    40, 30, (select id from pricing_rules where is_active and account_type = 'merchant' and delivery_type = p_type::delivery_type),
    p_type::delivery_type, p_price, 0, 0, 0, p_price, 'AED', 'cod',
    case when p_cod > 0 then 'postpaid' else 'prepaid' end::recipient_payment_type, p_cod, 'parcel', p_label, p_weight,
    -- A forged tier and "not billed": both overwritten by the database.
    'next_day_5_plus', false
  ) returning id into v_id;
  insert into ship values (p_label, v_id);
  return v_id;
end $$;

create function t_price(p_label text) returns text language sql as $$
  select price || '/' || coalesce(merchant_fee_tier, '-') || '/' || coalesce(merchant_order_count::text, '-') || '/' || fee_billed
  from shipments where id = (select id from ship where label = p_label);
$$;
grant execute on function t_book(text, uuid, text, numeric, uuid, numeric, numeric, uuid), t_price(text) to authenticated;

create function t_batch(p_id uuid, p_customer uuid) returns void language sql as $$
  insert into shipment_batches (id, name, customer_id, created_by) values (p_id, 'Batch ' || left(p_id::text, 4), p_customer, p_customer);
$$;
-- The server finalizing a booking (service role in the app).
create function t_finalize(p_id uuid) returns void language sql as $$
  update shipment_batches set status = 'submitted' where id = p_id;
$$;

-- ════════════════════════════════════════════════════════════════════════
\echo '── The policy table (the same cases as src/lib/pricing/merchant-fees.test.ts) ──'
select t_check('merchant_fee_policy() matches the app''s table',
  (select string_agg(c.d || ',' || c.r || ',' || c.n || '=' || p.tier || '/' || coalesce(p.fee::text, 'rule'), ' ' order by c.i)
   from (values
     (1, 'next_day', 'postpaid', 1), (2, 'next_day', 'postpaid', 7), (3, 'same_day', 'postpaid', 3),
     (4, 'next_day', 'prepaid', 5), (5, 'next_day', 'prepaid', 120), (6, 'next_day', 'prepaid', 2),
     (7, 'next_day', 'prepaid', 4), (8, 'next_day', 'prepaid', 1), (9, 'same_day', 'prepaid', 1),
     (10, 'same_day', 'prepaid', 3), (11, 'same_day', 'prepaid', 9)
   ) c(i, d, r, n)
   cross join lateral merchant_fee_policy(c.d::delivery_type, c.r::recipient_payment_type, c.n) p),
  'next_day,postpaid,1=cod_no_fee/0 next_day,postpaid,7=cod_no_fee/0 same_day,postpaid,3=cod_no_fee/0 '
  || 'next_day,prepaid,5=next_day_5_plus/15 next_day,prepaid,120=next_day_5_plus/15 next_day,prepaid,2=next_day_2_4/20 '
  || 'next_day,prepaid,4=next_day_2_4/20 next_day,prepaid,1=unconfirmed/rule same_day,prepaid,1=unconfirmed/rule '
  || 'same_day,prepaid,3=unconfirmed/rule same_day,prepaid,9=unconfirmed/rule');

\echo '── Single bookings ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000004a';
select t_book('cod1', '00000000-0000-0000-0000-00000000004a', 'next_day', 200, null, 30, 0);
select t_book('one_nd', '00000000-0000-0000-0000-00000000004a', 'next_day', 0, null, 30, 25);
select t_book('one_sd', '00000000-0000-0000-0000-00000000004a', 'same_day', 0, null, 10, 15);
select t_fails('ATTACK: a single booking at a price that isn''t the policy''s (the old AED 15 on COD)',
  $$select t_book('cod_old', '00000000-0000-0000-0000-00000000004a', 'next_day', 200, null, 30, 15)$$, '%not the merchant price%');
select t_fails('ATTACK: a merchant booking without the package weight',
  $$select t_book('noweight', '00000000-0000-0000-0000-00000000004a', 'next_day', 0, null, null, 15)$$, '%need the package weight%');
reset role;
select t_check('1. merchant COD shipment: no fee at all, billed (the forged tier was replaced)', t_price('cod1'), '0.00/cod_no_fee/1/true');
select t_check('4. the COD amount is untouched by any fee',
  (select cod_amount || '/' || base_charge || '/' || weight_charge || '/' || cod_charge from shipments where id = (select id from ship where label = 'cod1')),
  '200.00/0.00/0.00/0.00');
select t_check('7. a single non-COD order: no invented rate — the merchant rule (15 + 10 kg over), flagged',
  t_price('one_nd'), '25.00/unconfirmed/1/true');
select t_check('7. a same-day order: the merchant rule, flagged', t_price('one_sd'), '15.00/unconfirmed/1/true');

\echo '── Bookings of several ──'
select t_batch('40000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-00000000004a');
select t_batch('40000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-00000000004a');
select t_batch('40000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-00000000004a');
select t_batch('40000000-0000-4000-8000-0000000000c5', '00000000-0000-0000-0000-00000000004a');
select t_batch('40000000-0000-4000-8000-0000000000b4', '00000000-0000-0000-0000-00000000004b');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000004a';
-- Five non-COD Next-Day shipments.
select t_book('five' || g, '00000000-0000-0000-0000-00000000004a', 'next_day', 0, '40000000-0000-4000-8000-000000000005') from generate_series(1, 5) g;
-- Three non-COD Next-Day.
select t_book('three' || g, '00000000-0000-0000-0000-00000000004a', 'next_day', 0, '40000000-0000-4000-8000-000000000003') from generate_series(1, 3) g;
-- Two non-COD + three COD: five orders booked together.
select t_book('mix_p' || g, '00000000-0000-0000-0000-00000000004a', 'next_day', 0, '40000000-0000-4000-8000-00000000000a') from generate_series(1, 2) g;
select t_book('mix_c' || g, '00000000-0000-0000-0000-00000000004a', 'next_day', 75, '40000000-0000-4000-8000-00000000000a') from generate_series(1, 3) g;
-- Five, one of them cancelled before the booking is finalized.
select t_book('canc' || g, '00000000-0000-0000-0000-00000000004a', 'next_day', 0, '40000000-0000-4000-8000-0000000000c5') from generate_series(1, 5) g;
reset role;
select t_check('provisional while the booking is being created: the first of three priced as one',
  t_price('three1') || ' ' || t_price('three3'), '25.00/unconfirmed/1/true 20.00/next_day_2_4/3/true');
update shipments set status = 'cancelled', cancelled_reason = 'Merchant removed it' where id = (select id from ship where label = 'canc5');
select t_finalize('40000000-0000-4000-8000-000000000005'), t_finalize('40000000-0000-4000-8000-000000000003'),
       t_finalize('40000000-0000-4000-8000-00000000000a'), t_finalize('40000000-0000-4000-8000-0000000000c5');
select t_check('5. five non-COD Next-Day: AED 15 flat each',
  (select string_agg(distinct t_price(label), ',') from ship where label like 'five%'), '15.00/next_day_5_plus/5/true');
select t_check('6. three non-COD Next-Day: AED 20 each',
  (select string_agg(distinct t_price(label), ',') from ship where label like 'three%'), '20.00/next_day_2_4/3/true');
select t_check('COD and non-COD both count toward the size; COD still pays nothing',
  (select string_agg(distinct t_price(label), ',' order by t_price(label)) from ship where label like 'mix%'),
  '0.00/cod_no_fee/5/true,15.00/next_day_5_plus/5/true');
select t_check('8. cancelled before the booking was finalized: not counted (4 → AED 20)',
  (select string_agg(distinct t_price(label), ',') from ship where label like 'canc%' and label <> 'canc5'), '20.00/next_day_2_4/4/true');
update shipments set status = 'cancelled', cancelled_reason = 'Changed mind' where id = (select id from ship where label = 'canc4');
select t_check('8. cancelled after: the size was fixed at booking, the others keep AED 20',
  (select string_agg(distinct t_price(label), ',') from ship where label in ('canc1', 'canc2', 'canc3')), '20.00/next_day_2_4/4/true');
select t_check('every price changed at finalize is audited (three1: AED 25 provisional → 20)',
  (select count(*)::text from audit_logs where action = 'shipment.merchant_fee_policy' and entity_id in (select id from ship where label like 'three%')), '1');

\echo '── Repeats ──'
select t_finalize('40000000-0000-4000-8000-000000000005');
select t_check('12. finalizing again changes nothing', (select reprice_merchant_batch('40000000-0000-4000-8000-000000000005', 'again')::text), '0');
select t_check('12. …and adds no audit rows',
  (select count(*)::text from audit_logs where action = 'shipment.merchant_fee_policy' and entity_id in (select id from ship where label like 'five%')), '4');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000004a';
select t_book('rq', '00000000-0000-0000-0000-00000000004a', 'next_day', 0, null, 30, 25, '40000000-0000-4000-8000-0000000000ee');
select t_fails('12. the same request twice is one shipment',
  $$select t_book('rq2', '00000000-0000-0000-0000-00000000004a', 'next_day', 0, null, 30, 25, '40000000-0000-4000-8000-0000000000ee')$$, '%duplicate key%');
reset role;

\echo '── Never driver cash ──'
update shipments set driver_id = '00000000-0000-0000-0000-00000000004d', status = 'assigned'
where id in (select id from ship where label in ('cod1', 'one_nd', 'five1'));
select t_check('9. non-COD merchant shipments give the driver nothing to collect',
  (select count(*)::text from cod_transactions where shipment_id in (select id from ship where label in ('one_nd', 'five1'))), '0');
select t_check('2/9. the COD shipment: exactly the COD amount, no fee',
  (select amount || '/' || product_amount || '/' || delivery_fee_amount from cod_transactions where shipment_id = (select id from ship where label = 'cod1')),
  '200.00/200.00/0.00');
-- Staff raise the COD shipment's fee: still billed, still not driver cash.
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000004e';
select staff_adjust_shipment_price((select id from ship where label = 'cod1'), 'assigned', 0, 10, 'Agreed handling charge', gen_random_uuid());
reset role;
select t_check('9. a staff price edit never puts the fee on the driver',
  (select s.price || '|' || c.amount || '/' || c.delivery_fee_amount from shipments s join cod_transactions c on c.shipment_id = s.id
   where s.id = (select id from ship where label = 'cod1')),
  '10.00|200.00/0.00');
-- The driver delivers and collects.
set request.jwt.uid = '00000000-0000-0000-0000-00000000004d';
select t_check('2. the driver is asked for AED 200 and expects nothing else',
  (select (o ->> 'expected') from driver_cash_overview() o), '200.00');
update cod_transactions set status = 'collected' where shipment_id = (select id from ship where label = 'cod1');
reset request.jwt.uid;

\echo '── COD remitted in full ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000004d';
select t_check('3. collected: COD 200, fees 0 — the whole 200 can be remitted (no 1.5% off)',
  (select (o ->> 'collectedCod') || '|' || (o ->> 'collectedFee') || '|' || (o ->> 'availableCod') || '|' || (o ->> 'availableFee') from driver_cash_overview() o),
  '200.00|0.00|200.00|0.00');
select t_fails('9. there is no merchant fee to remit', $$select submit_driver_remittance(0, 0.01, null, gen_random_uuid())$$, '%more in delivery fees%');
select submit_driver_remittance(120, 0, 'Part one', gen_random_uuid()) ->> 'number' as part1 \gset
select t_check('10. a partial submission: still all outstanding, the rest available',
  (select (o ->> 'outstanding') || '|' || (o ->> 'availableCod') from driver_cash_overview() o), '200.00|80.00');
set request.jwt.uid = '00000000-0000-0000-0000-00000000004e';
select t_check('11. the operator confirms AED 120: AED 80 outstanding',
  confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'part1'), 120, 0, null) ->> 'driverOutstanding', '80.00');
set request.jwt.uid = '00000000-0000-0000-0000-00000000004d';
select submit_driver_remittance(80, 0, null, gen_random_uuid()) ->> 'number' as part2 \gset
set request.jwt.uid = '00000000-0000-0000-0000-00000000004e';
select dispute_driver_remittance((select id from driver_cash_remittances where remittance_number = :'part2'), 'Envelope not handed over');
set request.jwt.uid = '00000000-0000-0000-0000-00000000004d';
select t_check('11. a disputed submission leaves it outstanding', (select (o ->> 'outstanding') from driver_cash_overview() o), '80.00');
select submit_driver_remittance(80, 0, null, gen_random_uuid()) ->> 'number' as part3 \gset
set request.jwt.uid = '00000000-0000-0000-0000-00000000004e';
select t_check('3. the full COD reaches the operator: driver at AED 0.00',
  confirm_driver_remittance((select id from driver_cash_remittances where remittance_number = :'part3'), 80, 0, null) ->> 'driverOutstanding', '0.00');
select t_check('3. the operator holds the full AED 200 COD and no fee',
  (select (o ->> 'receivedCod') || '|' || (o ->> 'receivedFee') from operator_cash_overview() o), '200.00|0.00');
reset role;

\echo '── Individual customers unchanged ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000004c';
select t_fails('13. an individual''s wrong price is still refused (a forged merchant tier doesn''t help)',
  $$select t_book('ind_bad', '00000000-0000-0000-0000-00000000004c', 'next_day', 0)$$, '%row-level security%');
insert into shipments (
  customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, delivery_type, base_charge, distance_charge, weight_charge, cod_charge, price,
  currency, payment_method, package_type, package_description
) values (
  '00000000-0000-0000-0000-00000000004c', 'confirmed', 'Dubai Marina', 25.09, 55.14, 'Cust', '0501111111', 'JBR', 25.08, 55.13, 'R', '0509999999',
  14.6, 25, (select id from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual'),
  'same_day', 12, 9.60, 0, 0, 21.60, 'AED', 'cod', 'parcel', 'individual'
);
reset role;
select t_check('13. an individual''s correct price is accepted as before, not billed',
  (select price || '/' || coalesce(merchant_fee_tier, '-') || '/' || fee_billed from shipments where package_description = 'individual'), '21.60/-/false');
update shipments set driver_id = '00000000-0000-0000-0000-00000000004d', status = 'assigned' where package_description = 'individual';
select t_check('13. an individual still pays their cash fee to the driver',
  (select amount || '/' || delivery_fee_amount from cod_transactions where shipment_id = (select id from shipments where package_description = 'individual')),
  '21.60/21.60');

\echo '── Nobody sets the tier by hand ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000004a';
select t_fails('ATTACK: the merchant marks a fee as not billed',
  format('update shipments set fee_billed = false where id = %L', (select id from ship where label = 'one_nd')), '%only%');
set request.jwt.uid = '00000000-0000-0000-0000-00000000004e';
select t_fails('ATTACK: staff change the tier directly',
  format('update shipments set merchant_fee_tier = %L where id = %L', 'next_day_5_plus', (select id from ship where label = 'one_nd')), '%set by the pricing policy%');
reset role;

\echo '── Who sees what ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-00000000004b';
select t_check('15. another merchant sees none of these shipments',
  (select count(*)::text from shipments where id in (select id from ship)), '0');
set request.jwt.uid = '00000000-0000-0000-0000-00000000004c';
select t_check('15. a customer reads no driver''s cash', coalesce(driver_cash_overview('00000000-0000-0000-0000-00000000004d')::text, 'null'), 'null');
reset role;

\echo 'merchant-fee-policy: all checks passed'
