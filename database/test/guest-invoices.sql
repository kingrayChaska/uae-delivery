-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0054: an operator or manager issues
-- the invoice of a guest booking (a customer with no ParcelLink account)
-- from the stored shipment data; issuing again returns the same invoice and
-- charges nothing; COD is recorded apart from the charges; the payment
-- state is read from the payment records and only for those who can read
-- the invoice; registered customers' invoices are unchanged; nobody else
-- can issue or read one. Each check raises "FAIL ...".
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/guest-invoices.sql"

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

-- Operator (…71), manager (…72), deactivated operator (…73), registered
-- customer (…74), another customer (…75), driver (…76).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000071', 'gi-op@test.com',    '{"full_name":"Inv Operator","phone":"0507100001"}'),
  ('00000000-0000-0000-0000-000000000072', 'gi-mgr@test.com',   '{"full_name":"Inv Manager","phone":"0507100002"}'),
  ('00000000-0000-0000-0000-000000000073', 'gi-gone@test.com',  '{"full_name":"Gone Operator","phone":"0507100003"}'),
  ('00000000-0000-0000-0000-000000000074', 'gi-cust@test.com',  '{"full_name":"Reggie Registered","phone":"0507100004"}'),
  ('00000000-0000-0000-0000-000000000075', 'gi-other@test.com', '{"full_name":"Olive Other","phone":"0507100005"}'),
  ('00000000-0000-0000-0000-000000000076', 'gi-drv@test.com',   '{"full_name":"Dev Driver","phone":"0507100006"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id in ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000073');
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000072';
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-000000000076';
update profiles set active = false where id = '00000000-0000-0000-0000-000000000073';
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-000000000071', 'EMP-I1'), ('00000000-0000-0000-0000-000000000072', 'EMP-I2'),
  ('00000000-0000-0000-0000-000000000073', 'EMP-I3');

-- A shipment as the booking service inserts it: a guest booking by default
-- (COD 150 for the goods, delivery AED 21.60 paid in cash), with overrides.
create function t_ship(p_overrides jsonb default '{}') returns uuid language plpgsql as $$
declare
  v_rule uuid;
  v jsonb;
  v_id uuid;
begin
  select id into v_rule from pricing_rules where is_active and delivery_type = 'same_day' and account_type = 'individual';
  v := jsonb_build_object(
    'customer_id', null, 'booked_by', '00000000-0000-0000-0000-000000000071',
    'guest_customer_name', '  Walid Walk-in ', 'guest_customer_phone', '+971 55 100 2000',
    'client_request_id', gen_random_uuid(), 'status', 'confirmed', 'cod_amount', 150, 'recipient_payment_type', 'postpaid'
  ) || p_overrides;
  insert into shipments (
    customer_id, booked_by, guest_customer_name, guest_customer_phone, status,
    pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, recipient_payment_type, cod_amount, package_type, package_description, package_weight_kg,
    client_request_id
  ) values (
    (v->>'customer_id')::uuid, (v->>'booked_by')::uuid, v->>'guest_customer_name', v->>'guest_customer_phone', (v->>'status')::shipment_status,
    'Al Barsha', 25.09, 55.14, 'Shop Front', '04 222 3333',
    'Business Bay', 25.18, 55.27, 'Rami Recipient', '0507770000',
    14.6, 25, v_rule, 12, 9.60, 0, 0, 21.60,
    'AED', 'cod', (v->>'recipient_payment_type')::recipient_payment_type, (v->>'cod_amount')::numeric, 'parcel', 'Phone case', 1,
    (v->>'client_request_id')::uuid
  ) returning id into v_id;
  return v_id;
end $$;
grant execute on function t_ship(jsonb) to authenticated;

create temp table ship (label text primary key, id uuid);
grant select, insert on ship to authenticated, anon;

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
insert into ship values ('guest', t_ship());
insert into ship values ('guest_cancelled', t_ship('{"status":"cancelled"}'));
insert into ship values ('guest_prepaid', t_ship('{"cod_amount":0, "recipient_payment_type":"prepaid"}'));
-- A registered customer's shipment, entered by staff for them.
insert into ship values ('registered', t_ship('{"customer_id":"00000000-0000-0000-0000-000000000074", "guest_customer_name":null, "guest_customer_phone":null}'));
reset role;

-- ════════════════════════════════════════════════════════════════════════
\echo '── 1. An operator issues a guest booking''s invoice ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
select issue_shipment_invoice((select id from ship where label = 'guest')) as guest_inv \gset
select t_check('an invoice number', (:'guest_inv' ~ '^INV-\d{4}-\d{6}$')::text, 'true');
select t_check('issuing again returns the same invoice', issue_shipment_invoice((select id from ship where label = 'guest')), :'guest_inv');
reset role;

select t_check('one invoice, billed to the guest, no account',
  (select count(*)::text || ' ' || min(invoice_type) || ' ' || coalesce(min(customer_id::text), 'no-customer') || ' ' || coalesce(min(business_account_id::text), 'no-business')
   from invoices where shipment_id = (select id from ship where label = 'guest')),
  '1 individual_shipment no-customer no-business');
select t_check('billed to: the name and phone as booked, marked walk-in, no invented email',
  (select billed_to::text from invoices where invoice_number = :'guest_inv'),
  '{"name": "Walid Walk-in", "phone": "+971 55 100 2000", "walkIn": true}');
select t_check('the stored charges, unchanged: subtotal / additional / total',
  (select subtotal || ' / ' || additional_charges || ' / ' || total || ' ' || currency from invoices where invoice_number = :'guest_inv'),
  '21.60 / 0.00 / 21.60 AED');
select t_check('the line: delivery charges only; the COD for the goods recorded apart',
  (select base_charge || '+' || distance_charge || '=' || amount || ' cod ' || cod_amount
   from invoice_line_items where invoice_id = (select id from invoices where invoice_number = :'guest_inv')),
  '12.00+9.60=21.60 cod 150.00');
select t_check('issued by the operator, audited once',
  (select issued_by::text from invoices where invoice_number = :'guest_inv') || ' ' ||
  (select count(*)::text from audit_logs where action = 'invoice.issued' and new_value ->> 'invoiceNumber' = :'guest_inv'),
  '00000000-0000-0000-0000-000000000071 1');
select t_check('the shipment itself is untouched (status, payment, price)',
  (select status || ' ' || payment_status || ' ' || price from shipments where id = (select id from ship where label = 'guest')),
  'confirmed pending 21.60');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000072';
select t_check('a manager gets the same invoice', issue_shipment_invoice((select id from ship where label = 'guest')), :'guest_inv');
select issue_shipment_invoice((select id from ship where label = 'guest_prepaid')) as prepaid_inv \gset
select t_check('a prepaid guest booking: COD recorded as 0',
  (select cod_amount::text from invoice_line_items where invoice_id = (select id from invoices where invoice_number = :'prepaid_inv')),
  '0.00');
select t_fails('a cancelled guest booking can''t be invoiced',
  format('select issue_shipment_invoice(%L)', (select id from ship where label = 'guest_cancelled')), '%cancelled shipment cannot be invoiced%');
reset role;
select t_check('still one live invoice for the guest booking', (select count(*)::text from invoices where shipment_id = (select id from ship where label = 'guest')), '1');

\echo '── 2. Nobody else issues one ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000076';
select t_fails('ATTACK: a driver', format('select issue_shipment_invoice(%L)', (select id from ship where label = 'guest')), '%Shipment not found%');
set request.jwt.uid = '00000000-0000-0000-0000-000000000075';
select t_fails('ATTACK: a customer', format('select issue_shipment_invoice(%L)', (select id from ship where label = 'guest')), '%Shipment not found%');
set request.jwt.uid = '00000000-0000-0000-0000-000000000073';
select t_fails('ATTACK: a deactivated operator', format('select issue_shipment_invoice(%L)', (select id from ship where label = 'guest_prepaid')), '%Shipment not found%');
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
select t_fails('a registered customer''s shipment stays theirs to invoice',
  format('select issue_shipment_invoice(%L)', (select id from ship where label = 'registered')), '%Shipment not found%');
select t_fails('ATTACK: writing an invoice directly',
  $$insert into invoices (invoice_number, invoice_type, shipment_id, billed_to, reference, shipment_count, subtotal, total, currency)
    values ('INV-2026-999999', 'individual_shipment', (select id from ship where label = 'guest_cancelled'), '{"name":"x"}', 'x', 1, 0, 0, 'AED')$$,
  -- run.sh re-grants table privileges, so RLS (no insert policy) refuses
  -- here; in production the 0031 revoke refuses first.
  '%row-level security%');
reset role;
set role anon;
select t_fails('ATTACK: anonymous', format('select issue_shipment_invoice(%L)', (select id from ship where label = 'guest')), '%permission denied%');
reset role;

\echo '── 3. Registered customers are unchanged ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000074';
select issue_shipment_invoice((select id from ship where label = 'registered')) as reg_inv \gset
reset role;
select t_check('the customer''s own invoice, billed to their account',
  (select invoice_type || ' ' || customer_id || ' ' || (billed_to ->> 'name') || ' ' || coalesce(billed_to ->> 'walkIn', 'account') from invoices where invoice_number = :'reg_inv'),
  'individual_shipment 00000000-0000-0000-0000-000000000074 Reggie Registered account');
select t_fails('a guest invoice must be an individual shipment invoice',
  $$insert into invoices (invoice_number, invoice_type, shipment_id, billed_to, reference, shipment_count, subtotal, total, currency)
    values ('INV-2026-999998', 'merchant_shipment', (select id from ship where label = 'guest_cancelled'), '{"name":"x"}', 'x', 1, 0, 0, 'AED')$$,
  '%invoices_customer_or_guest%');

\echo '── 4. Who reads them ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
select t_check('staff read the guest invoice and its line',
  (select count(*)::text from invoices where invoice_number = :'guest_inv') || '/' ||
  (select count(*)::text from invoice_line_items where invoice_id = (select id from invoices where invoice_number = :'guest_inv')), '1/1');
set request.jwt.uid = '00000000-0000-0000-0000-000000000074';
select t_check('ATTACK: a customer can''t read a guest''s invoice', (select count(*)::text from invoices where invoice_number = :'guest_inv'), '0');
select t_check('ATTACK: …nor its payment state', coalesce(invoice_payment_state(:'guest_inv')::text, 'null'), 'null');
select t_check('but reads their own', (select count(*)::text from invoices where invoice_number = :'reg_inv'), '1');
set request.jwt.uid = '00000000-0000-0000-0000-000000000076';
select t_check('ATTACK: a driver reads none', (select count(*)::text from invoices), '0');
reset role;

\echo '── 5. Payment state comes from the payment records ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
select t_check('a new guest invoice is unpaid; the total is due',
  (select (s ->> 'state') || ' ' || (s ->> 'amountDue') || ' ' || (s ->> 'currency') from invoice_payment_state(:'guest_inv') s), 'unpaid 21.60 AED');
select t_check('reading it changes nothing', (select payment_status::text from shipments where id = (select id from ship where label = 'guest')), 'pending');
reset role;
update shipments set payment_status = 'paid' where id = (select id from ship where label = 'guest');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000072';
select t_check('paid only once the shipment is recorded paid', (select (s ->> 'state') || ' ' || (s ->> 'amountDue') from invoice_payment_state(:'guest_inv') s), 'paid 0');
set request.jwt.uid = '00000000-0000-0000-0000-000000000074';
select t_check('the customer reads their own invoice''s state', (select s ->> 'state' from invoice_payment_state(:'reg_inv') s), 'unpaid');
reset role;
update shipments set payment_status = 'pending' where id = (select id from ship where label = 'guest');

\echo '── 6. A price change voids it; a new one can be issued (0046) ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
select t_check('price changed by operations',
  (select (staff_adjust_shipment_price((select id from ship where label = 'guest'), 'confirmed', 21.60, 25.60, 'Agreed a larger parcel', gen_random_uuid()) is not null)::text), 'true');
select t_check('the old invoice is void', (select status from invoices where invoice_number = :'guest_inv'), 'void');
select t_check('…and has no payment state', coalesce(invoice_payment_state(:'guest_inv')::text, 'null'), 'null');
select issue_shipment_invoice((select id from ship where label = 'guest')) as guest_inv2 \gset
select t_check('a new invoice with the new price', (select total::text from invoices where invoice_number = :'guest_inv2'), '25.60');
select t_check('both stay on record, one live',
  (select string_agg(status, ',' order by issued_at) from invoices where shipment_id = (select id from ship where label = 'guest')), 'void,issued');
reset role;

\echo 'guest-invoices: all checks passed'
