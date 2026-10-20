-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0047: who may register an app push
-- token and for whom, that tokens can't be read or written behind someone's
-- back, and that the push worker's claim hands out each recent notification
-- of an active app user exactly once, with retries and limits.
-- Each check raises "FAIL ..." on a wrong answer.
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/mobile-push.sql"

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

-- Driver (…81), operator (…82), customer (…83), deactivated driver (…84).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000081', 'drv8@test.com', '{"full_name":"Dina Driver","phone":"0508880001"}'),
  ('00000000-0000-0000-0000-000000000082', 'op8@test.com',  '{"full_name":"Omar Operator","phone":"0508880002"}'),
  ('00000000-0000-0000-0000-000000000083', 'cus8@test.com', '{"full_name":"Cara Customer","phone":"0508880003"}'),
  ('00000000-0000-0000-0000-000000000084', 'old8@test.com', '{"full_name":"Ola Offboarded","phone":"0508880004"}');
alter table profiles disable trigger user;
update profiles set role = 'driver' where id in ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000084');
update profiles set role = 'operator' where id = '00000000-0000-0000-0000-000000000082';
update profiles set active = false where id = '00000000-0000-0000-0000-000000000084';
alter table profiles enable trigger user;

-- ── Registering ─────────────────────────────────────────────────────────

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000081';
select register_push_device('ExponentPushToken[driver-phone-1]', 'android');
select t_check('a driver registers their phone', (select count(*)::text from mobile_push_devices), '1');
select register_push_device('ExponentPushToken[driver-phone-1]', 'android');
select t_check('registering again changes nothing', (select count(*)::text from mobile_push_devices), '1');
select t_fails('not an Expo token', $q$select register_push_device('hello', 'android')$q$, '%check constraint%');
select t_fails('a platform that isn''t ios/android', $q$select register_push_device('ExponentPushToken[driver-phone-2]', 'web')$q$, 'Choose ios or android');
select t_fails('no direct writes', $q$insert into mobile_push_devices (profile_id, expo_push_token, platform)
  values ('00000000-0000-0000-0000-000000000082', 'ExponentPushToken[forged-for-op]', 'ios')$q$, '%row-level security%');
-- No update policy: RLS lets the statement run but matches no row.
update mobile_push_devices set enabled = false, profile_id = '00000000-0000-0000-0000-000000000082';
select t_check('no direct changes', (select (bool_and(enabled) and bool_and(profile_id = '00000000-0000-0000-0000-000000000081'))::text from mobile_push_devices), 'true');

set request.jwt.uid = '00000000-0000-0000-0000-000000000083';
select t_fails('customers use the website', $q$select register_push_device('ExponentPushToken[customer-phone]', 'ios')$q$, 'Only active staff%');
select t_check('a customer sees nobody else''s devices', (select count(*)::text from mobile_push_devices), '0');

set request.jwt.uid = '00000000-0000-0000-0000-000000000084';
select t_fails('a deactivated account can''t register', $q$select register_push_device('ExponentPushToken[old-phone-123]', 'ios')$q$, 'Only active staff%');

set request.jwt.uid = '';
select t_fails('signed out', $q$select register_push_device('ExponentPushToken[anon-phone-12]', 'ios')$q$, 'Not authenticated');
reset role;
set role anon;
select t_fails('anon can''t even call it', $q$select register_push_device('ExponentPushToken[anon-phone-12]', 'ios')$q$, '%permission denied%');
reset role;

-- The same phone, now signed in as the operator: the token follows them.
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000082';
select register_push_device('ExponentPushToken[driver-phone-1]', 'android');
select t_check('the token moved to whoever signed in last', (select profile_id::text from mobile_push_devices), '00000000-0000-0000-0000-000000000082');
set request.jwt.uid = '00000000-0000-0000-0000-000000000081';
select t_check('the driver no longer sees it', (select count(*)::text from mobile_push_devices), '0');
select unregister_push_device('ExponentPushToken[driver-phone-1]');
reset role;
select t_check('the driver can''t remove the operator''s token', (select count(*)::text from mobile_push_devices), '1');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000082';
select unregister_push_device('ExponentPushToken[driver-phone-1]');
reset role;
select t_check('the operator signs out: token removed', (select count(*)::text from mobile_push_devices), '0');

-- ── The worker's claim ──────────────────────────────────────────────────

set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000081';
select register_push_device('ExponentPushToken[driver-phone-1]', 'android');
select register_push_device('ExponentPushToken[driver-tablet]', 'ios');
select t_fails('clients can''t claim pushes', $q$select * from claim_push_notifications(10, 60, 3, 360)$q$, '%permission denied%');
select t_check('clients can''t read the outbox', (select count(*)::text from notification_push_deliveries), '0');
reset role;

insert into notifications (id, profile_id, type, title, body, created_at) values
  ('80000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000081', 'shipment.assigned', 'New delivery', 'One', now() - interval '5 minutes'),
  ('80000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000081', 'shipment.assigned', 'New delivery', 'Two', now()),
  ('80000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000081', 'shipment.assigned', 'Old news', 'Old', now() - interval '7 hours'),
  ('80000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000083', 'shipment.booked', 'Booked', 'No app', now());

set role service_role;
create temp table claim1 as select * from claim_push_notifications(50, 60, 3, 360);
reset role;
select t_check('recent notifications of app users only', (select string_agg(body, ',' order by body) from claim1), 'One,Two');
select t_check('every enabled device of the person', (select min(array_length(tokens, 1))::text from claim1), '2');
select t_check('first attempt counted', (select string_agg(attempts::text, ',') from claim1), '1,1');

set role service_role;
select t_check('a leased notification isn''t handed out twice', (select count(*)::text from claim_push_notifications(50, 60, 3, 360)), '0');
reset role;

-- One sent; the other's worker died (lease ran out).
update notification_push_deliveries set status = 'sent', sent_at = now(), locked_until = null
where notification_id = '80000000-0000-4000-8000-000000000001';
update notification_push_deliveries set locked_until = now() - interval '1 second'
where notification_id = '80000000-0000-4000-8000-000000000002';
set role service_role;
create temp table claim2 as select * from claim_push_notifications(50, 60, 3, 360);
reset role;
select t_check('sent is never sent again; an expired lease is retried', (select string_agg(body, ',') from claim2), 'Two');
select t_check('retry counted', (select attempts::text from claim2), '2');

update notification_push_deliveries set locked_until = now() - interval '1 second', attempts = 3
where notification_id = '80000000-0000-4000-8000-000000000002';
set role service_role;
select t_check('no more than the maximum attempts', (select count(*)::text from claim_push_notifications(50, 60, 3, 360)), '0');
reset role;

-- A device Expo reported gone, and an account deactivated since.
insert into notifications (id, profile_id, type, title, body) values
  ('80000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000081', 'shipment.assigned', 'New delivery', 'Five');
update mobile_push_devices set enabled = false, disabled_reason = 'DeviceNotRegistered' where expo_push_token = 'ExponentPushToken[driver-tablet]';
set role service_role;
create temp table claim3 as select * from claim_push_notifications(50, 60, 3, 360);
reset role;
select t_check('disabled devices are left out', (select array_to_string(tokens, ',') from claim3), 'ExponentPushToken[driver-phone-1]');

insert into notifications (id, profile_id, type, title, body) values
  ('80000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000081', 'shipment.assigned', 'New delivery', 'Six');
alter table profiles disable trigger user;
update profiles set active = false where id = '00000000-0000-0000-0000-000000000081';
alter table profiles enable trigger user;
set role service_role;
select t_check('nothing is pushed to a deactivated account', (select count(*)::text from claim_push_notifications(50, 60, 3, 360)), '0');
reset role;

select t_check('the notifications themselves were never touched', (select count(*)::text from notifications where read_at is not null), '0');

\echo 'mobile-push: all checks passed'
