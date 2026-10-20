-- Migration 0050's handling of shipments booked before it. Unlike the other
-- suites, run it on a scratch database migrated only up to 0049 (run.sh with
-- 0050+ left out): it books merchant shipments the old way, applies 0050,
-- and checks that open merchant fees leave the drivers' cash records (COD
-- stays), open shipments are re-priced at their booking's size, and
-- collected cash, delivered shipments, staff price edits and individual
-- customers are untouched. Each check raises "FAIL ...".
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/merchant-fee-backfill.sql"

\set ON_ERROR_STOP 1

create function t_check(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: got %, expected %', label, actual, expected; end if;
  raise notice 'ok  %  -> %', label, actual;
end $$;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000003a', 'm3@test.com', '{"full_name":"M Three","phone":"0503330001"}'),
  ('00000000-0000-0000-0000-00000000003c', 'c3@test.com', '{"full_name":"C Three","phone":"0503330003"}'),
  ('00000000-0000-0000-0000-00000000003d', 'd3@test.com', '{"full_name":"D Three","phone":"0503330004"}');
alter table profiles disable trigger user;
update profiles set account_type = 'merchant' where id = '00000000-0000-0000-0000-00000000003a';
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-00000000003d';
alter table profiles enable trigger user;
create temp table bf (label text primary key, id uuid);
insert into shipment_batches (id, name, customer_id, created_by, status) values
  ('30000000-0000-4000-8000-000000000003', 'Three', '00000000-0000-0000-0000-00000000003a', '00000000-0000-0000-0000-00000000003a', 'processing');
create function t_old(p_label text, p_customer uuid, p_cod numeric, p_batch uuid default null, p_adj numeric default 0) returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into shipments (customer_id, status, batch_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone, distance_km, duration_minutes,
    pricing_rule_id, delivery_type, base_charge, distance_charge, weight_charge, cod_charge, price, price_adjustment, currency, payment_method,
    recipient_payment_type, cod_amount, package_type, package_description, package_weight_kg)
  values (p_customer, 'confirmed', p_batch, 'A', 25, 55, 'S', '0500000000', 'B', 25.1, 55.1, 'R', '0500000001', 20, 30,
    (select id from pricing_rules where is_active and account_type = (select account_type from profiles where id = p_customer) and delivery_type = 'next_day'),
    'next_day', 15, 0, 0, 0, 15 + p_adj, p_adj, 'AED', 'cod', case when p_cod > 0 then 'postpaid' else 'prepaid' end::recipient_payment_type, p_cod, 'parcel', p_label, 2)
  returning id into v_id;
  insert into bf values (p_label, v_id);
  update shipments set driver_id = '00000000-0000-0000-0000-00000000003d', status = 'assigned' where id = v_id;
end $$;
select t_old('open_plain', '00000000-0000-0000-0000-00000000003a', 0);
select t_old('open_cod', '00000000-0000-0000-0000-00000000003a', 200);
select t_old('done_cod', '00000000-0000-0000-0000-00000000003a', 200);
select t_old('adjusted', '00000000-0000-0000-0000-00000000003a', 0, null, 2);
select t_old('b' || g, '00000000-0000-0000-0000-00000000003a', 0, '30000000-0000-4000-8000-000000000003') from generate_series(1, 3) g;
update shipment_batches set status = 'submitted' where id = '30000000-0000-4000-8000-000000000003';
select t_old('individual', '00000000-0000-0000-0000-00000000003c', 0);
-- done_cod: delivered, cash collected (COD + the old fee).
update shipments set status = 'driver_accepted' where id = (select id from bf where label = 'done_cod');
update shipments set status = 'arrived_pickup' where id = (select id from bf where label = 'done_cod');
update shipments set status = 'picked_up' where id = (select id from bf where label = 'done_cod');
update shipments set status = 'in_transit' where id = (select id from bf where label = 'done_cod');
update shipments set status = 'arrived_destination' where id = (select id from bf where label = 'done_cod');
update shipments set status = 'delivered' where id = (select id from bf where label = 'done_cod');
set request.jwt.uid = '00000000-0000-0000-0000-00000000003d';
update cod_transactions set status = 'collected' where shipment_id = (select id from bf where label = 'done_cod');
reset request.jwt.uid;
select t_check('before: every cash record carries the old AED 15 fee',
  (select string_agg(b.label || '=' || c.amount || '/' || c.delivery_fee_amount, ',' order by b.label) from cod_transactions c join bf b on b.id = c.shipment_id),
  'adjusted=17.00/17.00,b1=15.00/15.00,b2=15.00/15.00,b3=15.00/15.00,done_cod=215.00/15.00,individual=15.00/15.00,open_cod=215.00/15.00,open_plain=15.00/15.00');

\echo '── Applying 0050 ──'
\ir ../migrations/0050_merchant_fee_policy.sql

select t_check('open merchant shipments are billed; delivered/individual are not',
  (select string_agg(b.label || '=' || s.fee_billed, ',' order by b.label) from shipments s join bf b on b.id = s.id),
  'adjusted=true,b1=true,b2=true,b3=true,done_cod=false,individual=false,open_cod=true,open_plain=true');
select t_check('cash records: open merchant fees removed (no COD = no record); collected cash and the individual untouched',
  (select string_agg(b.label || '=' || c.amount || '/' || c.delivery_fee_amount || '/' || c.status, ',' order by b.label) from cod_transactions c join bf b on b.id = c.shipment_id),
  'done_cod=215.00/15.00/collected,individual=15.00/15.00/expected,open_cod=200.00/0.00/expected');
select t_check('prices: COD 0, the batch of 3 at 20, single at the rule (15), staff-adjusted and delivered kept',
  (select string_agg(b.label || '=' || s.price || '/' || coalesce(s.merchant_fee_tier, '-'), ',' order by b.label) from shipments s join bf b on b.id = s.id),
  'adjusted=17.00/-,b1=20.00/next_day_2_4,b2=20.00/next_day_2_4,b3=20.00/next_day_2_4,done_cod=15.00/-,individual=15.00/-,open_cod=0.00/cod_no_fee,open_plain=15.00/unconfirmed');
select t_check('each changed price has an audit row',
  (select count(*)::text from audit_logs where action = 'shipment.merchant_fee_policy'), '4');
select t_check('the driver now expects only the COD: 200 (+ the individual''s own 15)',
  (select sum(amount)::text from cod_transactions where driver_id = '00000000-0000-0000-0000-00000000003d' and status = 'expected'), '215.00');
select t_check('the cash already collected is still owed in full',
  (select outstanding::text from driver_cash_breakdown('00000000-0000-0000-0000-00000000003d')), '215.00');
\echo 'merchant-fee-backfill: all checks passed'
