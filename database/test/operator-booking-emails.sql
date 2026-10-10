-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0043: which bookings queue an
-- operator email, that each booking queues at most one, that later changes
-- queue nothing, that the queue is hidden from clients, and that the claim
-- function hands each email to one worker at a time.
-- Each check raises "FAIL ..." on a wrong answer.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/operator-booking-emails.sql"

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

grant execute on function t_check(text, text, text), t_fails(text, text, text) to authenticated, anon, service_role;

-- Individual customer (…71), merchant (…72), operator (…73), manager (…74).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000071', 'ind7@test.com',  '{"full_name":"Ida Individual","phone":"0507770001"}'),
  ('00000000-0000-0000-0000-000000000072', 'mer7@test.com',  '{"full_name":"Max Merchant","phone":"0507770002"}'),
  ('00000000-0000-0000-0000-000000000073', 'op7@test.com',   '{"full_name":"Olu Operator","phone":"0507770003"}'),
  ('00000000-0000-0000-0000-000000000074', 'mgr7@test.com',  '{"full_name":"Mia Manager","phone":"0507770004"}');
alter table profiles disable trigger user;
update profiles set account_type = 'merchant' where id = '00000000-0000-0000-0000-000000000072';
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-000000000073';
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000074';
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-000000000073', 'EMP-E1'), ('00000000-0000-0000-0000-000000000074', 'EMP-E2');
insert into business_accounts (id, company_name, contact_person, contact_email, contact_phone) values
  ('70000000-0000-4000-8000-0000000000b1', 'Max Goods LLC', 'Max', 'max@goods.test', '0507770002');
insert into business_account_members (business_account_id, profile_id) values
  ('70000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000072');

-- A booking as the booking service inserts it: an individual same-day
-- shipment priced on the seed rule (14.6 km → 12 + 9.60), or, with
-- '{"merchant":true}', a merchant next-day flat-rate one.
create function t_book(p jsonb default '{}') returns uuid language plpgsql as $$
declare
  v_merchant boolean := coalesce((p->>'merchant')::boolean, false);
  v_rule uuid;
  v_id uuid;
begin
  select id into v_rule from pricing_rules
  where is_active
    and account_type = (case when v_merchant then 'merchant' else 'individual' end)::account_type
    and delivery_type = (case when v_merchant then 'next_day' else 'same_day' end)::delivery_type;
  insert into shipments (
    customer_id, business_account_id, batch_id, status,
    pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    distance_km, duration_minutes, pricing_rule_id, delivery_type, package_weight_kg,
    base_charge, distance_charge, weight_charge, cod_charge, price,
    currency, payment_method, package_type, package_description, client_request_id
  ) values (
    coalesce((p->>'customer_id')::uuid, auth.uid()),
    case when v_merchant then '70000000-0000-4000-8000-0000000000b1'::uuid end,
    (p->>'batch_id')::uuid, 'confirmed',
    'Al Barsha', 25.09, 55.14, 'Shop Front', '04 222 3333',
    'Business Bay', 25.18, 55.27, 'Rami Recipient', '0507770000',
    coalesce((p->>'distance_km')::numeric, case when v_merchant then 30 else 14.6 end), 25, v_rule,
    (case when v_merchant then 'next_day' else 'same_day' end)::delivery_type, 2,
    case when v_merchant then 15 else 12 end, case when v_merchant then 0 else 9.60 end, 0, 0,
    case when v_merchant then 15 else 21.60 end,
    'AED', 'cod', 'parcel', coalesce(p->>'label', 'shipment'), (p->>'request_id')::uuid
  ) returning id into v_id;
  return v_id;
end $$;
grant execute on function t_book(jsonb) to authenticated;

create function t_queued(p_shipment uuid) returns text language sql as $$
  select count(*)::text from operator_booking_emails where shipment_id = p_shipment;
$$;
create function t_queued_batch(p_batch uuid) returns text language sql as $$
  select count(*)::text from operator_booking_emails where batch_id = p_batch;
$$;

create temp table booked (label text primary key, id uuid);
grant select, insert on booked to authenticated;

\echo '── Self-service bookings queue one email each ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
insert into booked select 'individual', t_book('{"label":"individual","request_id":"77777777-0000-4000-8000-000000000001"}');
set request.jwt.uid = '00000000-0000-0000-0000-000000000072';
insert into booked select 'merchant', t_book('{"merchant":true,"label":"merchant","request_id":"77777777-0000-4000-8000-000000000002"}');

\echo '── Staff-entered bookings queue nothing ──'
set request.jwt.uid = '00000000-0000-0000-0000-000000000073';
insert into booked select 'on_behalf', t_book('{"customer_id":"00000000-0000-0000-0000-000000000071","label":"on_behalf","request_id":"77777777-0000-4000-8000-000000000003"}');
reset role;

select t_check('individual self-booking queued once', t_queued((select id from booked where label = 'individual')), '1');
select t_check('merchant self-booking queued once', t_queued((select id from booked where label = 'merchant')), '1');
select t_check('operator booking on a customer''s behalf: not queued', t_queued((select id from booked where label = 'on_behalf')), '0');

-- A guest booking (migration 0040) has no customer at all.
set request.jwt.uid = '00000000-0000-0000-0000-000000000073';
insert into shipments (
  customer_id, booked_by, guest_customer_name, guest_customer_phone, status,
  pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
  dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
  distance_km, duration_minutes, pricing_rule_id, base_charge, distance_charge, weight_charge, cod_charge, price,
  currency, payment_method, package_type, package_description
) select null, '00000000-0000-0000-0000-000000000073', 'Wanda WhatsApp', '+971 55 909 1234', 'confirmed',
  'Al Barsha', 25.09, 55.14, 'Shop', '04 222 3333', 'Business Bay', 25.18, 55.27, 'Rami', '0507770000',
  14.6, 25, id, 12, 9.60, 0, 0, 21.60, 'AED', 'cod', 'parcel', 'guest'
  from pricing_rules where is_active and account_type = 'individual' and delivery_type = 'same_day';
select t_check('guest booking: not queued',
  (select count(*)::text from operator_booking_emails e join shipments s on s.id = e.shipment_id where s.package_description = 'guest'), '0');

-- A service-role insert has no signed-in user: not a customer's own booking.
set request.jwt.uid = '';
select t_check('no signed-in user: not queued',
  (select t_queued(t_book('{"customer_id":"00000000-0000-0000-0000-000000000071","label":"service"}'))), '0');

\echo '── A failed booking queues nothing ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
select t_fails('a booking over the distance limit is refused',
  $$select t_book('{"label":"too_far","distance_km":200}')$$, '%');
reset role;
select t_check('refused booking: nothing queued',
  (select count(*)::text from operator_booking_emails e join shipments s on s.id = e.shipment_id where s.package_description = 'too_far'), '0');
-- Anything that rolls the booking back takes its queue row with it.
begin;
set local request.jwt.uid = '00000000-0000-0000-0000-000000000071';
select t_book('{"label":"rolled_back"}');
rollback;
select t_check('rolled-back booking leaves no queued email',
  (select count(*)::text from operator_booking_emails e join shipments s on s.id = e.shipment_id where s.package_description = 'rolled_back'), '0');

\echo '── Later changes queue nothing ──'
select count(*) as before_updates from operator_booking_emails \gset
update shipments set status = 'cancelled', cancelled_reason = 'Customer changed plans' where id = (select id from booked where label = 'individual');
update shipments set package_description = 'edited' where id = (select id from booked where label = 'merchant');
select t_check('edits and status changes add no emails', (select count(*)::text from operator_booking_emails), :'before_updates');

\echo '── Batches: one summary email ──'
insert into shipment_batches (id, name, customer_id, created_by, status) values
  ('70000000-0000-4000-8000-00000000ba01', 'Booking of 2 shipments', '00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000071', 'processing'),
  ('70000000-0000-4000-8000-00000000ba02', 'CSV upload — staff', '00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000074', 'processing'),
  ('70000000-0000-4000-8000-00000000ba03', 'All rows failed', '00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000071', 'processing'),
  ('70000000-0000-4000-8000-00000000ba04', 'Merchant bulk list', '00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000072', 'draft');

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
insert into booked select 'batch_1', t_book('{"batch_id":"70000000-0000-4000-8000-00000000ba01","label":"batch_1","request_id":"77777777-0000-4000-8000-000000000011"}');
insert into booked select 'batch_2', t_book('{"batch_id":"70000000-0000-4000-8000-00000000ba01","label":"batch_2","request_id":"77777777-0000-4000-8000-000000000012"}');
reset role;
select t_check('batch shipments are not emailed one by one',
  (select count(*)::text from operator_booking_emails where shipment_id in (select id from booked where label like 'batch_%')), '0');
select t_check('still processing: nothing yet', t_queued_batch('70000000-0000-4000-8000-00000000ba01'), '0');

update shipment_batches set status = 'submitted', rows_submitted = 2, rows_failed = 0 where id = '70000000-0000-4000-8000-00000000ba01';
select t_check('finalized batch queued once', t_queued_batch('70000000-0000-4000-8000-00000000ba01'), '1');
update shipment_batches set notes = 'edited', rows_failed = 0 where id = '70000000-0000-4000-8000-00000000ba01';
select t_check('later batch update: still one', t_queued_batch('70000000-0000-4000-8000-00000000ba01'), '1');

update shipment_batches set status = 'partially_failed', rows_submitted = 3, rows_failed = 1 where id = '70000000-0000-4000-8000-00000000ba02';
select t_check('staff (manager CSV) batch: not queued', t_queued_batch('70000000-0000-4000-8000-00000000ba02'), '0');

update shipment_batches set status = 'failed', rows_submitted = 2, rows_failed = 2 where id = '70000000-0000-4000-8000-00000000ba03';
select t_check('batch with nothing booked: not queued', t_queued_batch('70000000-0000-4000-8000-00000000ba03'), '0');

-- Merchant bulk: a booking attempt that fails goes back to draft, then
-- succeeds; and a replayed finalize can't add a second email.
update shipment_batches set status = 'processing' where id = '70000000-0000-4000-8000-00000000ba04';
update shipment_batches set status = 'draft' where id = '70000000-0000-4000-8000-00000000ba04';
select t_check('merchant booking handed back to draft: not queued', t_queued_batch('70000000-0000-4000-8000-00000000ba04'), '0');
update shipment_batches set status = 'processing' where id = '70000000-0000-4000-8000-00000000ba04';
update shipment_batches set status = 'submitted', rows_submitted = 240, rows_failed = 0 where id = '70000000-0000-4000-8000-00000000ba04';
select t_check('merchant bulk list queued once', t_queued_batch('70000000-0000-4000-8000-00000000ba04'), '1');
update shipment_batches set status = 'processing' where id = '70000000-0000-4000-8000-00000000ba04';
update shipment_batches set status = 'submitted' where id = '70000000-0000-4000-8000-00000000ba04';
select t_check('replayed finalize: still one', t_queued_batch('70000000-0000-4000-8000-00000000ba04'), '1');

\echo '── Clients cannot see or touch the queue ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000071';
select t_check('customer sees no queue rows', (select count(*)::text from operator_booking_emails), '0');
select t_fails('ATTACK: customer queues an email',
  $$insert into operator_booking_emails (shipment_id) values ((select id from booked where label = 'on_behalf'))$$,
  '%row-level security%');
select t_fails('ATTACK: customer claims queued emails', $$select * from claim_operator_booking_emails(10, 120, 6)$$, '%permission denied%');
set request.jwt.uid = '00000000-0000-0000-0000-000000000073';
select t_check('operator session sees no queue rows either', (select count(*)::text from operator_booking_emails), '0');
reset role;
select t_check('the queue has no address column to point anywhere',
  (select count(*)::text from information_schema.columns
   where table_name = 'operator_booking_emails' and column_name ~ '(email|recipient|to_address)'), '0');

\echo '── Claiming ──'
select count(*) as queued from operator_booking_emails \gset
set role service_role;
create temp table claim1 as select * from claim_operator_booking_emails(50, 120, 6);
select t_check('first claim takes every due email', (select count(*)::text from claim1), :'queued');
select t_check('claimed rows are sending, attempt 1',
  (select string_agg(distinct status || '/' || attempts, ',') from claim1), 'sending/1');
select t_check('a second worker gets nothing while the lease holds',
  (select count(*)::text from claim_operator_booking_emails(50, 120, 6)), '0');
reset role;

-- A worker died: its lease runs out, and the row is handed out again.
update operator_booking_emails set locked_until = now() - interval '1 second'
where id = (select id from claim1 order by id limit 1);
set role service_role;
select t_check('expired lease: re-claimed with the next attempt',
  (select string_agg(attempts::text, ',') from claim_operator_booking_emails(50, 120, 6)), '2');
reset role;

-- A scheduled retry isn't handed out before it's due, nor past the cap.
update operator_booking_emails set status = 'pending', locked_until = null, next_attempt_at = now() + interval '5 minutes'
where id = (select id from claim1 order by id limit 1 offset 1);
update operator_booking_emails set status = 'pending', locked_until = null, attempts = 6, next_attempt_at = now() - interval '1 minute'
where id = (select id from claim1 order by id limit 1 offset 2);
update operator_booking_emails set status = 'accepted', locked_until = null
where id = (select id from claim1 order by id limit 1 offset 3);
set role service_role;
select t_check('not due, out of attempts, or accepted: none claimed',
  (select count(*)::text from claim_operator_booking_emails(50, 120, 6)), '0');
reset role;

select t_check('one queue row per booking, whatever happened', (select (count(*) = count(distinct coalesce(shipment_id, batch_id)))::text from operator_booking_emails), 'true');

\echo 'operator-booking-emails: all checks passed'
