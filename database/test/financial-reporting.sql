-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0044: the calculation engine
-- (financial_shipment_lines), merchant statements (draft → published →
-- superseded, immutability, who may see them), expenses and the business
-- performance report. Each check raises "FAIL ..." on a wrong answer.
--
-- Worked examples, all in January 2026 (Asia/Dubai):
--
-- Merchant A — a mixed account:
--   a1  delivered  postpaid COD 1,000 (verified)  fee 15 by card (unpaid)
--   a2  delivered  postpaid COD 2,000 (verified)  fee 17 (incl. COD fee 2) in cash, collected
--   a3  delivered  prepaid                        fee 15 by card (unpaid)
--   a4  returned                                  fee 20            → return 10.00
--   a5  returned   was postpaid                   fee 17 (COD fee 2) → return 7.50 (50% of 15)
--   a6  cancelled                                 → not on the statement
--   a7  delivered in February                     → not on the statement
--   a8  delivered  postpaid COD 500, collected before 0042 (unverified) → excluded, flagged
--   a9  in transit                                → not on the statement
--   a10 delivered  postpaid COD 300 (verified, already paid out to the merchant)
--   a11 delivered  postpaid COD 250, never recorded as collected → excluded, flagged
--   COD 3,300 − paid out 300 − service 92 − returns 17.50 + fee already paid
--   17 = 2,907.50 to the merchant. (No cash-handling charge since 0051.)
--
-- Merchant B — the brief's example: COD 10,000, service 1,500, return 200
--   → remittance 8,300.00 (the 1.5% cash-handling charge was removed, 0051).
-- Merchant C — no COD: service 2,000 + 450 + 100, of which 100 paid by card
--   (plus a failed attempt that must not count) → 2,450.00 due from the merchant.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/financial-reporting.sql"

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

-- Manager (…a1), operator (…a2), merchant members A/B/C (…a3/a4/a5),
-- individual customer (…a6), driver (…a7).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'mgr@fin.test',  '{"full_name":"Fin Manager","phone":"0508880001"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'op@fin.test',   '{"full_name":"Fin Operator","phone":"0508880002"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'ma@fin.test',   '{"full_name":"Merchant A","phone":"0508880003"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'mb@fin.test',   '{"full_name":"Merchant B","phone":"0508880004"}'),
  ('00000000-0000-0000-0000-0000000000a5', 'mc@fin.test',   '{"full_name":"Merchant C","phone":"0508880005"}'),
  ('00000000-0000-0000-0000-0000000000a6', 'ind@fin.test',  '{"full_name":"Indy Vidual","phone":"0508880006"}'),
  ('00000000-0000-0000-0000-0000000000a7', 'drv@fin.test',  '{"full_name":"Fin Driver","phone":"0508880007"}');
alter table profiles disable trigger user;
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-0000000000a2';
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-0000000000a7';
update profiles set account_type = 'merchant' where id in (
  '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a5');
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'EMP-F1'), ('00000000-0000-0000-0000-0000000000a2', 'EMP-F2');

insert into business_accounts (id, company_name, contact_person, contact_email, contact_phone, billing_info) values
  ('00000000-0000-0000-0000-00000000b0a0', 'Alpha Trading LLC', 'Merchant A', 'a@alpha.test', '0508880003', '{"address":"Al Quoz","city":"Dubai","country":"UAE"}'),
  ('00000000-0000-0000-0000-00000000b0b0', 'Bravo Goods', 'Merchant B', 'b@bravo.test', '0508880004', '{}'),
  ('00000000-0000-0000-0000-00000000b0c0', 'Charlie Supplies', 'Merchant C', 'c@charlie.test', '0508880005', '{}');
insert into business_account_members (business_account_id, profile_id) values
  ('00000000-0000-0000-0000-00000000b0a0', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-00000000b0b0', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-00000000b0c0', '00000000-0000-0000-0000-0000000000a5');

create temp table ship (label text primary key, id uuid);
grant select on ship to authenticated, anon;

-- One shipment, walked through the real state machine to p_final, with the
-- final status stamped at p_at.
create function t_mk(
  p_label text, p_customer uuid, p_ba uuid, p_price numeric, p_cod_charge numeric,
  p_method payment_method, p_cod numeric, p_final text, p_at timestamptz
) returns uuid language plpgsql as $$
declare
  v_id uuid;
  v_path text[];
  v_step text;
begin
  insert into shipments (
    customer_id, business_account_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, recipient_payment_type, cod_amount, package_type, package_description,
    booked_by, guest_customer_name, guest_customer_phone
  ) values (
    p_customer, p_ba, 'confirmed', 'Pickup', 25.09, 55.14, 'Sender', '0500000000',
    'Dropoff ' || p_label, 25.18, 55.27, 'Recipient ' || p_label, '0500000001', 10, 20,
    p_price - p_cod_charge, 0, 0, p_cod_charge, p_price,
    'AED', p_method, case when p_cod > 0 then 'postpaid' else 'prepaid' end::recipient_payment_type, p_cod, 'parcel', p_label,
    case when p_customer is null then '00000000-0000-0000-0000-0000000000a2'::uuid end,
    case when p_customer is null then 'Walk In' end,
    case when p_customer is null then '0501234567' end
  ) returning id into v_id;
  insert into ship values (p_label, v_id);

  v_path := case p_final
    when 'cancelled' then array['cancelled']
    when 'in_transit' then array['assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit']
    when 'returned' then array['assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'returned']
    else array['assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivered']
  end;
  foreach v_step in array v_path loop
    update shipments set status = v_step::shipment_status,
      driver_id = case when v_step = 'assigned' then '00000000-0000-0000-0000-0000000000a7'::uuid else driver_id end
    where id = v_id;
  end loop;

  update shipment_status_history set created_at = p_at where shipment_id = v_id and status = p_final::shipment_status;
  return v_id;
end $$;

-- verified: collected after 0042. unverified: collected before it.
-- remitted: verified, then paid out to the merchant.
create function t_collect(p_label text, p_mode text) returns void language plpgsql as $$
declare v_id uuid := (select id from ship where label = p_label);
begin
  if p_mode = 'unverified' then
    alter table cod_transactions disable trigger cod_transactions_record_collection;
    update cod_transactions set status = 'collected', collected_at = now() where shipment_id = v_id;
    alter table cod_transactions enable trigger cod_transactions_record_collection;
  else
    update cod_transactions set status = 'collected' where shipment_id = v_id;
    if p_mode = 'remitted' then
      alter table cod_transactions disable trigger cod_transactions_record_collection;
      update cod_transactions set status = 'remitted' where shipment_id = v_id;
      alter table cod_transactions enable trigger cod_transactions_record_collection;
    end if;
  end if;
end $$;

-- Lines of a statement as "tracking-label:event:cod/service/return/handling/paid/remitted".
create function t_lines(p_statement uuid) returns text language sql as $$
  select string_agg(s.label || ':' || l.event || ':' || l.cod_collected || '/' || l.service_charge || '/' || l.return_charge
    || '/' || l.cash_handling_fee || '/' || l.payments_received || '/' || l.cod_remitted, ' ' order by s.label)
  from merchant_statement_lines l join ship s on s.id = l.shipment_id
  where l.statement_id = p_statement
$$;

-- A statement's totals as "cod/remitted/service/return/base/handling/paid = net outcome kind".
create function t_totals(p_statement uuid) returns text language sql as $$
  select total_cod || '/' || cod_already_remitted || '/' || service_charges || '/' || return_charges || '/'
    || cash_handling_base || '/' || cash_handling_fee || '/' || payments_received || ' = ' || net_amount || ' ' || outcome || ' ' || kind
  from merchant_statements where id = p_statement
$$;

grant execute on function t_lines(uuid), t_totals(uuid) to authenticated;

\echo '── Fixtures ──'
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000b0a0';
  b constant uuid := '00000000-0000-0000-0000-00000000b0b0';
  c constant uuid := '00000000-0000-0000-0000-00000000b0c0';
  ma constant uuid := '00000000-0000-0000-0000-0000000000a3';
  mb constant uuid := '00000000-0000-0000-0000-0000000000a4';
  mc constant uuid := '00000000-0000-0000-0000-0000000000a5';
  ind constant uuid := '00000000-0000-0000-0000-0000000000a6';
begin
  perform t_mk('a01', ma, a, 15, 0, 'card', 1000, 'delivered', '2026-01-05 10:00+04');
  perform t_mk('a02', ma, a, 17, 2, 'cod', 2000, 'delivered', '2026-01-06 10:00+04');
  perform t_mk('a03', ma, a, 15, 0, 'card', 0, 'delivered', '2026-01-07 10:00+04');
  perform t_mk('a04', ma, a, 20, 0, 'card', 0, 'returned', '2026-01-08 10:00+04');
  perform t_mk('a05', ma, a, 17, 2, 'card', 400, 'returned', '2026-01-09 10:00+04');
  perform t_mk('a06', ma, a, 15, 0, 'card', 0, 'cancelled', '2026-01-10 10:00+04');
  -- 00:30 on 1 February in Dubai is still 31 January in UTC: February.
  perform t_mk('a07', ma, a, 15, 0, 'card', 0, 'delivered', '2026-02-01 00:30+04');
  perform t_mk('a08', ma, a, 15, 0, 'card', 500, 'delivered', '2026-01-12 10:00+04');
  perform t_mk('a09', ma, a, 15, 0, 'card', 0, 'in_transit', '2026-01-13 10:00+04');
  perform t_mk('a10', ma, a, 15, 0, 'card', 300, 'delivered', '2026-01-14 10:00+04');
  perform t_mk('a11', ma, a, 15, 0, 'card', 250, 'delivered', '2026-01-31 23:30+04');

  perform t_mk('b1', mb, b, 1000, 0, 'card', 6000, 'delivered', '2026-01-03 09:00+04');
  perform t_mk('b2', mb, b, 500, 0, 'card', 4000, 'delivered', '2026-01-04 09:00+04');
  perform t_mk('b3', mb, b, 400, 0, 'card', 0, 'returned', '2026-01-05 09:00+04');

  perform t_mk('c1', mc, c, 2000, 0, 'card', 0, 'delivered', '2026-01-20 09:00+04');
  perform t_mk('c2', mc, c, 450, 0, 'card', 0, 'delivered', '2026-01-21 09:00+04');
  perform t_mk('c3', mc, c, 100, 0, 'card', 0, 'delivered', '2026-01-22 09:00+04');

  perform t_mk('i1', ind, null, 30, 0, 'cod', 0, 'delivered', '2026-01-15 09:00+04');
  perform t_mk('i2', ind, null, 25, 0, 'card', 0, 'returned', '2026-01-16 09:00+04');
  perform t_mk('g1', null, null, 21.60, 0, 'cod', 0, 'delivered', '2026-01-17 09:00+04');
end $$;

select t_collect('a01', 'verified');
select t_collect('a02', 'verified');
select t_collect('a08', 'unverified');
select t_collect('a10', 'remitted');
select t_collect('b1', 'verified');
select t_collect('b2', 'verified');
select t_collect('i1', 'verified');
select t_collect('g1', 'verified');
-- a11's cash record stays 'expected': delivered, but never confirmed collected.

insert into payments (shipment_id, customer_id, amount, method, status) values
  ((select id from ship where label = 'c3'), '00000000-0000-0000-0000-0000000000a5', 100, 'card', 'failed'),
  ((select id from ship where label = 'c3'), '00000000-0000-0000-0000-0000000000a5', 100, 'card', 'paid');
-- A repeated delivery event must not list b1 twice.
insert into shipment_status_history (shipment_id, status, created_at)
values ((select id from ship where label = 'b1'), 'delivered', '2026-01-03 09:05+04');

select t_check('cash records: a02 goods + cash fee, a05 dropped on return',
  (select string_agg(s.label || '=' || c.product_amount || '+' || c.delivery_fee_amount || ':' || c.status, ',' order by s.label)
   from cod_transactions c join ship s on s.id = c.shipment_id where s.label in ('a02', 'a05', 'a11')),
  'a02=2000.00+17.00:collected,a11=250.00+0.00:expected');

\echo '── The calculation engine ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a2';
select t_check('operator gets no financial lines',
  (select count(*)::text from financial_shipment_lines('2026-01-01', '2026-01-31', null)), '0');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a3';
select t_check('merchant gets no financial lines',
  (select count(*)::text from financial_shipment_lines('2026-01-01', '2026-01-31', '00000000-0000-0000-0000-00000000b0a0')), '0');
select t_check('merchant can''t see expenses', (select count(*)::text from expense_categories), '0');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select t_check('merchant A lines: only completed in January, once each',
  (select string_agg(s.label || ':' || l.event, ',' order by s.label)
   from financial_shipment_lines('2026-01-01', '2026-01-31', '00000000-0000-0000-0000-00000000b0a0') l join ship s on s.id = l.shipment_id),
  'a01:delivered,a02:delivered,a03:delivered,a04:returned,a05:returned,a08:delivered,a10:delivered,a11:delivered');
select t_check('February picks up a07 (Dubai calendar day)',
  (select string_agg(s.label, ',') from financial_shipment_lines('2026-02-01', '2026-02-28', '00000000-0000-0000-0000-00000000b0a0') l
   join ship s on s.id = l.shipment_id), 'a07');
select t_check('repeated delivery event lists b1 once',
  (select count(*)::text from financial_shipment_lines('2026-01-01', '2026-01-31', '00000000-0000-0000-0000-00000000b0b0') l
   where l.shipment_id = (select id from ship where label = 'b1')), '1');
select t_check('flags: unverified a08 500, uncollected a11 250',
  (select sum(cod_unverified) || '/' || sum(cod_uncollected)
   from financial_shipment_lines('2026-01-01', '2026-01-31', '00000000-0000-0000-0000-00000000b0a0')), '500.00/250.00');
select t_check('individual returns carry no return charge',
  (select return_charge::text from financial_shipment_lines('2026-01-01', '2026-01-31', null) l
   where l.shipment_id = (select id from ship where label = 'i2')), '0.00');

\echo '── Merchant A statement (mixed account) ──'
select set_config('t.sa', generate_merchant_statement('00000000-0000-0000-0000-00000000b0a0', '2026-01-01', '2026-01-31')::text, false);
select t_check('A lines',
  t_lines(current_setting('t.sa')::uuid),
  'a01:delivered:1000.00/15.00/0.00/0.00/0.00/0.00 a02:delivered:2000.00/17.00/0.00/0.00/17.00/0.00 '
  || 'a03:delivered:0.00/15.00/0.00/0.00/0.00/0.00 a04:returned:0.00/0.00/10.00/0.00/0.00/0.00 '
  || 'a05:returned:0.00/0.00/7.50/0.00/0.00/0.00 a08:delivered:0.00/15.00/0.00/0.00/0.00/0.00 '
  || 'a10:delivered:300.00/15.00/0.00/0.00/0.00/300.00 a11:delivered:0.00/15.00/0.00/0.00/0.00/0.00');
select t_check('A totals',
  t_totals(current_setting('t.sa')::uuid),
  '3300.00/300.00/92.00/17.50/3300.00/0.00/17.00 = 2907.50 payable_to_merchant cod_remittance');
select t_check('A draft: no number, still a draft, rates recorded',
  (select coalesce(statement_number, 'none') || ' ' || status || ' ' || return_charge_rate || ' ' || cash_handling_rate
   from merchant_statements where id = current_setting('t.sa')::uuid), 'none draft 0.5000 0.0000');
select t_check('A merchant snapshot', (select merchant ->> 'name' from merchant_statements where id = current_setting('t.sa')::uuid), 'Alpha Trading LLC');
reset role;

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a3';
select t_check('merchant can''t see a draft', (select count(*)::text from merchant_statements), '0');
select t_check('merchant can''t see draft lines', (select count(*)::text from merchant_statement_lines), '0');
select t_fails('ATTACK: merchant publishes their own draft',
  format('select publish_merchant_statement(%L)', current_setting('t.sa')), '%Only a manager%');
select t_fails('ATTACK: merchant generates a statement',
  $$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0a0', '2026-01-01', '2026-01-31')$$, '%Only a manager%');
select t_fails('ATTACK: merchant inserts a statement directly',
  $$insert into merchant_statements (business_account_id, period_start, period_end, merchant, return_charge_rate, cash_handling_rate,
      line_count, delivered_count, returned_count, total_cod, cod_already_remitted, service_charges, return_charges,
      cash_handling_base, cash_handling_fee, payments_received, net_amount, outcome, kind, generated_by, status, statement_number,
      published_by, published_at)
    values ('00000000-0000-0000-0000-00000000b0a0', '2026-03-01', '2026-03-31', '{}', 0.5, 0.015, 1, 1, 0, 0, 0, 0, 0, 0, 0,
      1000000, 1000000, 'payable_to_merchant', 'service_charges', '00000000-0000-0000-0000-0000000000a3', 'published', 'STM-X',
      '00000000-0000-0000-0000-0000000000a3', now())$$,
  -- No INSERT privilege on Supabase; the local test grants add it back, so
  -- RLS refuses it there. Either way it names the table.
  '%merchant_statements%');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a2';
select t_check('operator can''t see statements', (select count(*)::text from merchant_statements), '0');
select t_fails('ATTACK: operator generates a statement',
  $$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0a0', '2026-01-01', '2026-01-31')$$, '%Only a manager%');
reset role;

\echo '── Publishing ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select set_config('t.na', publish_merchant_statement(current_setting('t.sa')::uuid), false);
select t_check('published number format', (select current_setting('t.na') ~ '^STM-\d{4}-\d{6}$')::text, 'true');
select t_check('publishing twice returns the same number',
  publish_merchant_statement(current_setting('t.sa')::uuid), current_setting('t.na'));
select t_fails('a second statement can''t overlap a published one',
  $$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0a0', '2026-01-15', '2026-02-10')$$,
  '%already covers part of this period%');
select t_fails('a published statement can''t be discarded',
  format('select discard_merchant_statement(%L)', current_setting('t.sa')), '%Only a draft statement can be discarded%');
select t_fails('a period can''t end in the future',
  $$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0b0', current_date, current_date + 1)$$, '%can''t end in the future%');
select t_fails('reversed period',
  $$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0b0', '2026-01-31', '2026-01-01')$$, '%valid reporting period%');
select t_fails('nothing to report',
  $$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0b0', '2025-06-01', '2025-06-30')$$, '%no completed deliveries%');
reset role;

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a3';
select t_check('merchant A sees the published statement and its lines',
  (select count(*) || '/' || (select count(*) from merchant_statement_lines) from merchant_statements), '1/8');
select t_check('merchant A is told', (select count(*)::text from notifications where type = 'statement.published'), '1');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a4';
select t_check('ATTACK: merchant B can''t see A''s statement',
  (select count(*) || '/' || (select count(*) from merchant_statement_lines) from merchant_statements where id = current_setting('t.sa')::uuid), '0/0');
select t_check('merchant B wasn''t told', (select count(*)::text from notifications where type = 'statement.published'), '0');
reset role;

\echo '── Published statements never change ──'
select t_fails('ATTACK: edit a published total (even the service role)',
  format('update merchant_statements set net_amount = 1 where id = %L', current_setting('t.sa')), '%cannot be changed%');
select t_fails('ATTACK: re-open a published statement',
  format('update merchant_statements set status = %L, statement_number = null where id = %L', 'draft', current_setting('t.sa')), '%cannot be changed%');
select t_fails('ATTACK: delete a published statement',
  format('delete from merchant_statements where id = %L', current_setting('t.sa')), '%cannot be changed%');
select t_fails('ATTACK: edit a published line',
  format('update merchant_statement_lines set service_charge = 0 where statement_id = %L', current_setting('t.sa')), '%cannot be changed%');
select t_fails('ATTACK: delete a published line',
  format('delete from merchant_statement_lines where statement_id = %L', current_setting('t.sa')), '%cannot be changed%');

-- The source records change after publication: a03's fee is corrected
-- from 15 to 20 (by staff) and a new card payment arrives for a01.
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
update shipments set price = 20, base_charge = 20 where id = (select id from ship where label = 'a03');
insert into payments (shipment_id, customer_id, amount, method, status)
values ((select id from ship where label = 'a01'), '00000000-0000-0000-0000-0000000000a3', 15, 'card', 'paid');
select t_check('the published statement keeps its figures',
  t_totals(current_setting('t.sa')::uuid),
  '3300.00/300.00/92.00/17.50/3300.00/0.00/17.00 = 2907.50 payable_to_merchant cod_remittance');

\echo '── Corrections ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select t_fails('a correction needs a reason',
  format($$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0a0', '2026-01-01', '2026-01-31', %L, 'no')$$,
    current_setting('t.sa')), '%reason for the correction%');
select t_fails('a correction covers the same period',
  format($$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0a0', '2026-01-01', '2026-01-30', %L, 'Fee corrected')$$,
    current_setting('t.sa')), '%same period%');
select set_config('t.sa2', generate_merchant_statement(
  '00000000-0000-0000-0000-00000000b0a0', '2026-01-01', '2026-01-31', current_setting('t.sa')::uuid, 'a03 fee corrected to AED 20')::text, false);
-- service +5 (a03), paid +15 (a01 card): 2907.50 − 5 + 15
select t_check('correction draft totals',
  t_totals(current_setting('t.sa2')::uuid),
  '3300.00/300.00/97.00/17.50/3300.00/0.00/32.00 = 2917.50 payable_to_merchant cod_remittance');
select t_check('correction is version 2 and still a draft',
  (select version || ' ' || status from merchant_statements where id = current_setting('t.sa2')::uuid), '2 draft');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a3';
select t_check('merchant doesn''t see the correction draft', (select count(*)::text from merchant_statements), '1');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select set_config('t.na2', publish_merchant_statement(current_setting('t.sa2')::uuid), false);
select t_check('original is superseded, keeps its number and figures',
  (select status || ' ' || (statement_number = current_setting('t.na')) || ' ' || net_amount || ' ' || (superseded_by_id = current_setting('t.sa2')::uuid)
   from merchant_statements where id = current_setting('t.sa')::uuid), 'superseded true 2907.50 true');
select t_check('correction is published under a new number',
  (select status || ' ' || (statement_number <> current_setting('t.na')) from merchant_statements where id = current_setting('t.sa2')::uuid), 'published true');
select t_fails('a superseded statement can''t be corrected again',
  format($$select generate_merchant_statement('00000000-0000-0000-0000-00000000b0a0', '2026-01-01', '2026-01-31', %L, 'Second try')$$,
    current_setting('t.sa')), '%Only a published statement can be corrected%');
reset role;
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a3';
select t_check('merchant sees both versions', (select string_agg(status, ',' order by version) from merchant_statements), 'superseded,published');
reset role;

\echo '── Merchant B (the brief''s COD example) and C (no COD) ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select set_config('t.sb', generate_merchant_statement('00000000-0000-0000-0000-00000000b0b0', '2026-01-01', '2026-01-31')::text, false);
select t_check('B: 10,000 − 1,500 − 200 = 8,300 (no cash-handling charge)',
  t_totals(current_setting('t.sb')::uuid),
  '10000.00/0.00/1500.00/200.00/10000.00/0.00/0.00 = 8300.00 payable_to_merchant cod_remittance');
select set_config('t.sc', generate_merchant_statement('00000000-0000-0000-0000-00000000b0c0', '2026-01-01', '2026-01-31')::text, false);
select t_check('C: 2,550 service − 100 paid = 2,450 due, no COD remittance',
  t_totals(current_setting('t.sc')::uuid),
  '0.00/0.00/2550.00/0.00/0.00/0.00/100.00 = -2450.00 due_from_merchant service_charges');
select discard_merchant_statement(current_setting('t.sc')::uuid);
select t_check('a draft can be discarded', (select count(*)::text from merchant_statements where id = current_setting('t.sc')::uuid), '0');
select t_check('its lines went with it', (select count(*)::text from merchant_statement_lines where statement_id = current_setting('t.sc')::uuid), '0');
select t_check('audit trail',
  (select string_agg(action, ',' order by action) from audit_logs where entity_type = 'merchant_statement'),
  'statement.discarded,statement.generated,statement.generated,statement.generated,statement.generated,statement.published,statement.published');
reset role;

\echo '── Expenses ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select t_check('four starting categories',
  (select string_agg(name || ':' || profit_group, ',' order by name) from expense_categories),
  'Fuel:fuel,Rent:rent,Salary:salary,Subscription:subscription');
insert into expense_categories (name, profit_group) values ('Marketing', 'other');
select t_fails('category names are unique, whatever the case',
  $$insert into expense_categories (name) values ('  marketing ')$$, '%duplicate key%');
select t_fails('built-in categories keep their name',
  $$update expense_categories set name = 'Wages' where name = 'Salary'$$, '%Built-in expense categories%');
select t_fails('built-in categories keep their group',
  $$update expense_categories set profit_group = 'other' where name = 'Fuel'$$, '%Built-in expense categories%');
select t_fails('ATTACK: create a fake built-in category',
  $$insert into expense_categories (name, profit_group, is_system) values ('Diesel', 'fuel', true)$$, '%Built-in expense categories%');

insert into expenses (category_id, description, amount, incurred_on, created_by)
select id, d, amt, day::date, '00000000-0000-0000-0000-0000000000a1'
from (values
  ('Fuel', 'Fleet fuel January', 500, '2026-01-31'),
  ('Subscription', 'Maps API', 100, '2026-01-10'),
  ('Salary', 'January payroll', 3000, '2026-01-28'),
  ('Rent', 'Warehouse January', 2000, '2026-01-01'),
  ('Marketing', 'Flyers', 50, '2026-01-15'),
  ('Fuel', 'Duplicate entry', 999, '2026-01-20'),
  ('Rent', 'Warehouse February', 2000, '2026-02-01')
) v(cat, d, amt, day)
join expense_categories c on c.name = v.cat;

select t_fails('voiding needs a reason',
  $$update expenses set status = 'void' where description = 'Duplicate entry'$$, '%reason for voiding%');
update expenses set status = 'void', void_reason = 'Entered twice' where description = 'Duplicate entry';
select t_check('void records who and when',
  (select status || ' ' || (voided_by = '00000000-0000-0000-0000-0000000000a1') || ' ' || (voided_at is not null)
   from expenses where description = 'Duplicate entry'), 'void true true');
select t_fails('a void expense never changes',
  $$update expenses set amount = 1 where description = 'Duplicate entry'$$, '%Void expenses cannot be changed%');
select t_fails('voiding can''t change the figures',
  $$update expenses set status = 'void', void_reason = 'Wrong', amount = 1 where description = 'Flyers'$$, '%without changing it%');
update expenses set amount = 2000.00, notes = 'Confirmed with landlord' where description = 'Warehouse January';
select t_check('an edit records who made it',
  (select updated_by::text from expenses where description = 'Warehouse January'), '00000000-0000-0000-0000-0000000000a1');
-- ATTACK: forge created_by on an edit (silently kept as it was).
update expenses set created_by = '00000000-0000-0000-0000-0000000000a2' where description = 'Flyers';
select t_check('created_by can''t be rewritten',
  (select created_by::text from expenses where description = 'Flyers'), '00000000-0000-0000-0000-0000000000a1');
reset role;
select t_fails('ATTACK: delete an expense (even the service role)',
  $$delete from expenses where description = 'Flyers'$$, '%cannot be deleted%');
select t_check('expense audit trail',
  (select string_agg(action, ',' order by action) from audit_logs where entity_type = 'expense' and action <> 'expense.created'),
  'expense.updated,expense.updated,expense.voided');
-- The four built-in categories are seeded by the migration itself.
select t_check('category audit trail', (select count(*)::text from audit_logs where action = 'expense_category.created'), '1');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a2';
select t_check('operator sees no expenses', (select count(*)::text from expenses), '0');
-- Since 0052 an operator records their own expenses: they are the
-- operator's, and stay out of the figures below until a manager approves
-- their report (expense-reports.sql).
insert into expenses (category_id, description, amount, incurred_on, created_by)
values ((select id from expense_categories limit 1), 'Operator fuel', 1, '2026-01-01', '00000000-0000-0000-0000-0000000000a2');
select t_check('an operator''s expense is theirs and unreported',
  (select source || '/' || (report_id is null)::text from expenses where description = 'Operator fuel'), 'operator/true');
-- ATTACK: operator records an expense as the manager — the database takes
-- the recorder from the session (0044), so it is simply the operator's.
insert into expenses (category_id, description, amount, incurred_on, created_by)
values ((select id from expense_categories limit 1), 'Sneaky', 1, '2026-01-01', '00000000-0000-0000-0000-0000000000a1');
select t_check('ATTACK: …recorded as the operator''s own, not the manager''s',
  (select created_by || '/' || source from expenses where description = 'Sneaky'), '00000000-0000-0000-0000-0000000000a2/operator');
select t_fails('ATTACK: operator adds a category', $$insert into expense_categories (name) values ('Bonus')$$, '%row-level security%');
select t_fails('ATTACK: operator runs the performance report',
  $$select * from business_performance_summary('2026-01-01', '2026-01-31')$$, '%Only a manager%');
reset role;

\echo '── Performance report ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
-- Revenue: merchant service A 97 (a03 now 20) + B 1,500 + C 2,550 = 4,147;
-- returns A 17.50 + B 200; no cash handling (0051); individual
-- i1 30 + guest g1 21.60. COD goods money (A 3,300 + B 10,000) is not revenue.
select t_check('revenue',
  (select merchant_service_revenue || '/' || merchant_return_revenue || '/' || merchant_cash_handling_revenue || '/'
     || individual_revenue || '/' || other_revenue || ' = ' || total_revenue || ' (COD memo ' || merchant_cod_collected || ')'
   from business_performance_summary('2026-01-01', '2026-01-31')),
  '4147.00/217.50/0.00/51.60/0.00 = 4416.10 (COD memo 13300.00)');
select t_check('counts',
  (select delivered_count || '/' || merchant_delivered_count || '/' || individual_delivered_count || '/' || returned_count
   from business_performance_summary('2026-01-01', '2026-01-31')), '13/11/2/4');
select t_check('expenses by group (void and February excluded)',
  (select fuel || '/' || subscription || '/' || salary || '/' || rent || '/' || other_expenses || ' = ' || total_expenditure || ' (' || expense_count || ')'
   from business_performance_summary('2026-01-01', '2026-01-31')),
  '500.00/100.00/3000.00/2000.00/50.00 = 5650.00 (5)');
-- 4,416.10 − 500 = 3,916.10; − 100 = 3,816.10; − 3,000 = 816.10;
-- − 2,000 = −1,183.90; − 50 = −1,233.90.
select t_check('the four stepwise profits and net operating profit',
  (select profit_after_fuel || '/' || profit_after_subscription || '/' || profit_after_salary || '/' || profit_after_rent || '/' || net_operating_profit
   from business_performance_summary('2026-01-01', '2026-01-31')),
  '3916.10/3816.10/816.10/-1183.90/-1233.90');
select t_check('break-even',
  (select break_even_revenue || '/' || break_even_gap from business_performance_summary('2026-01-01', '2026-01-31')), '5650.00/1233.90');
select t_check('break-even achieved when revenue covers costs',
  (select break_even_gap::text from business_performance_summary('2026-01-02', '2026-01-09')), '0.00');
select t_check('category totals',
  (select string_agg(name || '=' || total, ',') from expense_category_totals('2026-01-01', '2026-01-31')),
  'Salary=3000.00,Rent=2000.00,Fuel=500.00,Subscription=100.00,Marketing=50.00');
select t_fails('report periods are bounded',
  $$select * from business_performance_summary('2024-01-01', '2026-01-31')$$, '%at most 366 days%');
reset role;

\echo '── Rates (migration 0045) ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a2';
select t_fails('ATTACK: operator changes the rates',
  $$select set_financial_rates((now() at time zone 'Asia/Dubai')::date, 0.1, 0)$$, '%Only a manager%');
select t_check('operator can''t read the rates', (select count(*)::text from financial_rates), '0');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select t_fails('rates can''t be backdated',
  $$select set_financial_rates((now() at time zone 'Asia/Dubai')::date - 1, 0.4, 0)$$, '%from today onwards%');
select t_fails('rates are bounded',
  $$select set_financial_rates((now() at time zone 'Asia/Dubai')::date, 1.5, 0)$$, '%between 0%% and 100%%');
select t_fails('0051: no cash-handling charge can be set again',
  $$select set_financial_rates((now() at time zone 'Asia/Dubai')::date, 0.4, 0.015)$$, '%cash-handling charge has been removed%');
select set_financial_rates((now() at time zone 'Asia/Dubai')::date, 0.40, 0, 'New contract terms');
select t_check('today''s rates', (select return_charge_rate || '/' || cash_handling_rate from financial_policy()), '0.4000/0');
select t_check('January''s rates are unchanged (and carry no cash handling)',
  (select return_charge_rate || '/' || cash_handling_rate from financial_policy('2026-01-15')), '0.5000/0');
select t_check('January''s revenue is unchanged by the new rates',
  (select total_revenue::text from business_performance_summary('2026-01-01', '2026-01-31')), '4416.10');
-- Replacing a rate scheduled for today is allowed; it's the same row.
select set_financial_rates((now() at time zone 'Asia/Dubai')::date, 0.40, null, 'New contract terms (confirmed)');
select t_check('one rate per day', (select count(*)::text from financial_rates), '2');
select t_check('statement lines carry no cash-handling rate',
  (select string_agg(distinct cash_handling_rate::text, ',') from merchant_statement_lines where statement_id = current_setting('t.sa')::uuid), '0.0000');
reset role;
select t_fails('ATTACK: rewrite a rate already in force (even the service role)',
  $$update financial_rates set cash_handling_rate = 0.1 where effective_from = '2000-01-01'$$, '%already in force%');
select t_fails('ATTACK: delete a rate (even the service role)',
  $$delete from financial_rates where effective_from = '2000-01-01'$$, '%already in force%');

-- Merchant D: one COD delivery before the new rate, one after it.
insert into business_accounts (id, company_name, contact_person, contact_email, contact_phone)
values ('00000000-0000-0000-0000-00000000b0d0', 'Delta Retail', 'Merchant A', 'd@delta.test', '0508880009');
insert into business_account_members values ('00000000-0000-0000-0000-00000000b0d0', '00000000-0000-0000-0000-0000000000a3');
select t_mk('d1', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000b0d0', 15, 0, 'card', 1000, 'delivered',
  (((now() at time zone 'Asia/Dubai')::date - 1)::timestamp + interval '10 hours') at time zone 'Asia/Dubai');
select t_mk('d2', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000b0d0', 15, 0, 'card', 1000, 'delivered',
  (((now() at time zone 'Asia/Dubai')::date)::timestamp + interval '1 hour') at time zone 'Asia/Dubai');
select t_collect('d1', 'verified');
select t_collect('d2', 'verified');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select set_config('t.sd', generate_merchant_statement('00000000-0000-0000-0000-00000000b0d0',
  (now() at time zone 'Asia/Dubai')::date - 1, (now() at time zone 'Asia/Dubai')::date)::text, false);
select t_check('each delivery at the rate of its own day',
  t_lines(current_setting('t.sd')::uuid), 'd1:delivered:1000.00/15.00/0.00/0.00/0.00/0.00 d2:delivered:1000.00/15.00/0.00/0.00/0.00/0.00');
select t_check('header: today''s rates, flagged as varying (the return rate changed), COD paid out in full',
  (select cash_handling_rate || ' ' || rates_vary || ' ' || net_amount from merchant_statements where id = current_setting('t.sd')::uuid),
  '0.0000 true 1970.00');
reset role;

\echo '── Statement emails ──'
select t_check('each publication queued one email', (select count(*)::text from merchant_statement_emails), '2');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select publish_merchant_statement(current_setting('t.sb')::uuid, false);
reset role;
select t_check('publishing without email queues nothing',
  (select count(*)::text from merchant_statement_emails where statement_id = current_setting('t.sb')::uuid), '0');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a3';
select t_check('merchants can''t see the email queue', (select count(*)::text from merchant_statement_emails), '0');
select t_fails('ATTACK: merchant claims queued emails', $$select * from claim_merchant_statement_emails(10, 60, 5)$$, '%permission denied%');
reset role;

\echo '── Settlements ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
select t_check('B opens with 8,300 owed to the merchant',
  (select balance || ' ' || settlement_status from merchant_statement_balance(current_setting('t.sb')::uuid)), '8300.00 open');
select set_config('t.p1', record_statement_settlement(current_setting('t.sb')::uuid, 5000, 'bank_transfer',
  (now() at time zone 'Asia/Dubai')::date, 'TRF-1', null, '22222222-0000-4000-8000-000000000001')::text, false);
select t_check('a retry returns the same payment',
  record_statement_settlement(current_setting('t.sb')::uuid, 5000, 'bank_transfer',
    (now() at time zone 'Asia/Dubai')::date, 'TRF-1', null, '22222222-0000-4000-8000-000000000001')::text, current_setting('t.p1'));
select t_check('paid out to the merchant; 3,300 left',
  (select paid_to_merchant || '/' || paid_by_merchant || ' ' || balance || ' ' || settlement_status
   from merchant_statement_balance(current_setting('t.sb')::uuid)), '5000.00/0.00 3300.00 partially_settled');
select t_check('direction comes from the balance', (select direction from merchant_statement_settlements where id = current_setting('t.p1')::uuid), 'to_merchant');
select t_fails('can''t pay more than is outstanding',
  format('select record_statement_settlement(%L, 4000, %L, current_date, null, null, gen_random_uuid())', current_setting('t.sb'), 'cash'),
  '%more than is outstanding%');
select t_fails('payment dates can''t be in the future',
  format('select record_statement_settlement(%L, 10, %L, current_date + 3, null, null, gen_random_uuid())', current_setting('t.sb'), 'cash'),
  '%can''t be in the future%');
select t_fails('payments only on a published statement',
  format('select record_statement_settlement(%L, 10, %L, current_date, null, null, gen_random_uuid())', current_setting('t.sd'), 'cash'),
  '%current published statement%');
select t_fails('voiding needs a reason', format('select void_statement_settlement(%L, %L)', current_setting('t.p1'), 'no'), '%reason for voiding%');
reset role;
select t_fails('ATTACK: edit a payment (even the service role)',
  format('update merchant_statement_settlements set amount = 1 where id = %L', current_setting('t.p1')), '%can only be voided%');
select t_fails('ATTACK: delete a payment (even the service role)',
  format('delete from merchant_statement_settlements where id = %L', current_setting('t.p1')), '%can''t be deleted%');
select t_fails('ATTACK: remit B''s COD shipment by shipment as well',
  format('update cod_transactions set status = %L where shipment_id = %L', 'remitted', (select id from ship where label = 'b1')),
  '%paid out through statement STM-%');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a4';
select t_check('merchant B sees the payment and the balance',
  (select count(*) || ' ' || (select balance from merchant_statement_balance(current_setting('t.sb')::uuid)) from merchant_statement_settlements),
  '1 3300.00');
select t_check('merchant B was told', (select count(*)::text from notifications where type = 'statement.settlement'), '1');
select t_fails('ATTACK: merchant records a payment',
  format('select record_statement_settlement(%L, 3150, %L, current_date, null, null, gen_random_uuid())', current_setting('t.sb'), 'cash'),
  '%Only a manager%');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a3';
select t_check('ATTACK: merchant A can''t see B''s payment or balance',
  (select count(*) || ' ' || coalesce((select balance::text from merchant_statement_balance(current_setting('t.sb')::uuid)), 'none')
   from merchant_statement_settlements where statement_id = current_setting('t.sb')::uuid), '0 none');
reset role;

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000a1';
-- A correction keeps what was already paid on the statement it replaces.
select set_config('t.sb2', generate_merchant_statement('00000000-0000-0000-0000-00000000b0b0', '2026-01-01', '2026-01-31',
  current_setting('t.sb')::uuid, 'Reissued after review')::text, false);
select publish_merchant_statement(current_setting('t.sb2')::uuid);
select t_check('the correction''s balance counts the earlier payment',
  (select net_amount || ' ' || paid_to_merchant || ' ' || balance from merchant_statement_balance(current_setting('t.sb2')::uuid)),
  '8300.00 5000.00 3300.00');
select t_fails('payments go on the current statement, not the replaced one',
  format('select record_statement_settlement(%L, 10, %L, current_date, null, null, gen_random_uuid())', current_setting('t.sb'), 'cash'),
  '%current published statement%');
select void_statement_settlement(current_setting('t.p1')::uuid, 'Transfer bounced');
select t_check('a voided payment no longer counts',
  (select balance || ' ' || settlement_status from merchant_statement_balance(current_setting('t.sb2')::uuid)), '8300.00 open');
select record_statement_settlement(current_setting('t.sb2')::uuid, 8300, 'bank_transfer', (now() at time zone 'Asia/Dubai')::date,
  'TRF-2', 'Full remittance', '22222222-0000-4000-8000-000000000002');
select t_check('settled in full', (select balance || ' ' || settlement_status from merchant_statement_balance(current_setting('t.sb2')::uuid)), '0.00 settled');
select t_fails('nothing more can be paid on a settled statement',
  format('select record_statement_settlement(%L, 1, %L, current_date, null, null, gen_random_uuid())', current_setting('t.sb2'), 'cash'),
  '%already settled%');
reset role;
select t_check('settlement audit trail',
  (select string_agg(action, ',' order by action) from audit_logs where entity_type = 'merchant_statement_settlement'),
  'statement.settlement_recorded,statement.settlement_recorded,statement.settlement_voided');

\echo 'financial-reporting: all checks passed'
