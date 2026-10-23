-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0052: operators record their own
-- expenses and weekly / monthly / custom reports (Monday–Sunday weeks,
-- calendar months, no overlaps, month-end and Sunday dates included);
-- submission locks a report; managers approve or return it (with a
-- reason); approved expenses change only by an audited correction; the
-- official performance figures count manager-recorded and approved
-- operator expenses — each expense once — and show the rest by status;
-- operators see only their own expenses, reports and receipts; repeats
-- change nothing and notify no one twice. Each check raises "FAIL ...".
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/expense-reports.sql"

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

-- Operators (…c1, …c2), manager (…c3), driver (…c4), customer (…c5).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'eo1@test.com', '{"full_name":"Exp Op One","phone":"0501230001"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'eo2@test.com', '{"full_name":"Exp Op Two","phone":"0501230002"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'em@test.com',  '{"full_name":"Exp Manager","phone":"0501230003"}'),
  ('00000000-0000-0000-0000-0000000000c4', 'ed@test.com',  '{"full_name":"Exp Driver","phone":"0501230004"}'),
  ('00000000-0000-0000-0000-0000000000c5', 'ec@test.com',  '{"full_name":"Exp Customer","phone":"0501230005"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
update profiles set role = 'manager' where id = '00000000-0000-0000-0000-0000000000c3';
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-0000000000c4';
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'EMP-X1'), ('00000000-0000-0000-0000-0000000000c2', 'EMP-X2'),
  ('00000000-0000-0000-0000-0000000000c3', 'EMP-X3');

create function t_cat(p_name text) returns uuid language sql as $$ select id from expense_categories where name = p_name $$;
grant execute on function t_cat(text) to authenticated;

-- An expense recorded by the signed-in caller. It tries to claim to be a
-- manager's, already in a report: the database decides both. A receipt is
-- attached as the app does since 0053 (set_expense_receipts, same statement).
create function t_spend(p_label text, p_category text, p_amount numeric, p_on date, p_receipt text default null)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into expenses (category_id, description, amount, incurred_on, created_by, source)
  values (t_cat(p_category), p_label, p_amount, p_on, auth.uid(), 'manager')
  returning id into v_id;
  if p_receipt is not null then
    perform set_expense_receipts(v_id, jsonb_build_array(jsonb_build_object('path', p_receipt)));
  end if;
  return v_id;
end $$;
grant execute on function t_spend(text, text, numeric, date, text) to authenticated;

create function t_exp(p_label text) returns text language sql security definer as $$
  select x.source || '/' || x.amount || '/' || coalesce(r.report_number like 'EXR-%', false)::text || '/' || coalesce(r.status, '-')
  from expenses x left join expense_reports r on r.id = x.report_id where x.description = p_label;
$$;

-- The operator's receipt, stored by the app's checked upload route (0053:
-- browsers can't write to the bucket).
insert into storage.objects (bucket_id, name, owner, metadata)
values ('expense-receipts', '00000000-0000-0000-0000-0000000000c1/fuel.pdf', '00000000-0000-0000-0000-0000000000c1', '{"mimetype":"application/pdf","size":1200}');

-- A manager-recorded expense from before 0052 (written as the database).
insert into expenses (category_id, description, amount, incurred_on, created_by)
values (t_cat('Subscription'), 'Legacy software', 50, '2026-09-10', '00000000-0000-0000-0000-0000000000c3');

-- ════════════════════════════════════════════════════════════════════════
\echo '── 1. Operators record their own expenses ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_check('an operator reads the categories', (select count(*)::text from expense_categories where name in ('Fuel', 'Rent', 'Salary', 'Subscription')), '4');
select t_spend('Fuel Monday', 'Fuel', 100, '2026-09-07', '00000000-0000-0000-0000-0000000000c1/fuel.pdf');
select t_spend('Rent Sunday', 'Rent', 500, '2026-09-13');
select t_spend('Salary month-end', 'Salary', 300, '2026-09-30');
select t_spend('Fuel October 1st', 'Fuel', 40, '2026-10-01');
select t_fails('ATTACK: a receipt in someone else''s folder',
  $$select t_spend('Stolen receipt', 'Fuel', 1, '2026-09-08', '00000000-0000-0000-0000-0000000000c2/x.pdf')$$, '%receipt you uploaded yourself%');
select t_fails('ATTACK: a receipt path that climbs out of the folder',
  $$select t_spend('Climb', 'Fuel', 1, '2026-09-08', '00000000-0000-0000-0000-0000000000c1/../c2.pdf')$$, '%receipt you uploaded yourself%');
reset role;
select t_check('recorded as the operator''s, not in a report yet (the forged "manager" ignored)', t_exp('Fuel Monday'), 'operator/100.00/false/-');

\echo '── 6/15. Each operator sees only their own ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c2';
select t_check('ATTACK: another operator sees none of them', (select count(*)::text from expenses), '0');
select t_fails('ATTACK: another operator edits one',
  $$update expenses set amount = 1 where description = 'Fuel Monday' returning 1/0$$, '%');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c4';
select t_check('ATTACK: a driver sees no expenses or categories',
  (select count(*) || '/' || (select count(*) from expense_categories) from expenses), '0/0');
select t_fails('ATTACK: a driver records an expense', $$select t_spend('Driver', 'Fuel', 5, '2026-09-08')$$, '%row-level security%');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c5';
select t_check('ATTACK: a customer sees no expenses', (select count(*)::text from expenses), '0');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_check('the operator doesn''t see the manager''s expense', (select count(*)::text from expenses where description = 'Legacy software'), '0');
reset role;

\echo '── 2/9. Weekly, monthly and custom reports ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_fails('a week starts on a Monday', $$select create_expense_report('week', '2026-09-08', '2026-09-14', gen_random_uuid())$$, '%Monday to Sunday%');
select t_fails('a month is a calendar month', $$select create_expense_report('month', '2026-09-02', '2026-10-01', gen_random_uuid())$$, '%calendar month%');
select t_fails('no future reports', $$select create_expense_report('week', '2030-01-07', '2030-01-13', gen_random_uuid())$$, '%future%');
select create_expense_report('week', '2026-09-07', '2026-09-13', '40000000-0000-4000-8000-0000000000e1') as wk \gset
select t_check('a retried request is the same report', create_expense_report('week', '2026-09-07', '2026-09-13', '40000000-0000-4000-8000-0000000000e1')::text, :'wk');
select t_fails('reports never overlap: September overlaps the week',
  $$select create_expense_report('month', '2026-09-01', '2026-09-30', gen_random_uuid())$$, '%overlaps your report EXR-%');
select create_expense_report('custom', '2026-09-14', '2026-09-30', gen_random_uuid()) as rest \gset
select create_expense_report('month', '2026-10-01', '2026-10-31', gen_random_uuid()) as oct \gset
reset role;
select t_check('Monday and Sunday expenses are in the week; month-end in the rest of September; the 1st in October',
  t_exp('Fuel Monday') || ' ' || t_exp('Rent Sunday') || ' ' || t_exp('Salary month-end') || ' ' || t_exp('Fuel October 1st'),
  'operator/100.00/true/draft operator/500.00/true/draft operator/300.00/true/draft operator/40.00/true/draft');
select t_check('each expense in exactly one report',
  (select count(*)::text from expenses where source = 'operator' and report_id is null), '0');
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_check('the week''s categories, for its operator',
  (select string_agg(name || '=' || total, ',' order by name) from expense_report_categories(:'wk')), 'Fuel=100.00,Rent=500.00');
select t_spend('Fuel Tuesday', 'Fuel', 25, '2026-09-08');
reset role;
select t_check('an expense dated in a draft report joins it', t_exp('Fuel Tuesday'), 'operator/25.00/true/draft');

\echo '── Discard a draft ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select discard_expense_report(:'oct');
reset role;
select t_check('discarded: the October expense is unreported again, the report gone',
  t_exp('Fuel October 1st') || ' ' || (select count(*) from expense_reports where id = :'oct'), 'operator/40.00/false/- 0');

\echo '── 5. Submit ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c2';
select t_fails('ATTACK: another operator submits it', format('select submit_expense_report(%L)', :'wk'), '%Report not found%');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_check('submitted', submit_expense_report(:'wk'), 'submitted');
select t_check('a repeated submit changes nothing', submit_expense_report(:'wk'), 'submitted');
select t_fails('5. the operator can''t approve it', format('select approve_expense_report(%L, null)', :'wk'), '%Only a manager%');
select t_fails('locked: an expense in a submitted report can''t be edited',
  $$update expenses set amount = 1 where description = 'Fuel Monday'$$, '%submitted report%');
select t_fails('locked: nor voided',
  $$update expenses set status = 'void', void_reason = 'Mistake entry' where description = 'Fuel Monday'$$, '%submitted report%');
select t_fails('locked: no new expense dated inside it',
  $$select t_spend('Late fuel', 'Fuel', 10, '2026-09-09')$$, '%already been submitted%');
-- ATTACK: an operator writes a report directly (no write policy: refused, or no row matches).
do $$ begin
  update expense_reports set status = 'approved' where status = 'submitted';
exception when others then null;
end $$;
reset role;
select t_check('ATTACK: …the report is still only submitted', (select status from expense_reports where id = :'wk'), 'submitted');
select t_check('the managers were told once',
  (select count(*)::text from notifications where type = 'expense_report.submitted' and profile_id = '00000000-0000-0000-0000-0000000000c3'), '1');
select t_check('the submitted total is kept', (select submitted_total::text from expense_reports where id = :'wk'), '625.00');

\echo '── 7/11. Official figures: manager-recorded + approved only ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c3';
select t_check('submitted expenses are not yet in the official September figures',
  (select subscription || '/' || fuel || '/' || rent || '/' || salary || '/' || total_expenditure || '/' || expense_count
   from business_performance_summary('2026-09-01', '2026-09-30')),
  '50.00/0.00/0.00/0.00/50.00/1');
select t_check('…they are awaiting review; the rest of September is not submitted',
  (select manager_recorded || '/' || approved || '/' || official || '/' || awaiting_review || '/' || returned || '/' || not_submitted
     || ' reports ' || submitted_reports || '/' || approved_reports || '/' || returned_reports || '/' || draft_reports
   from expense_review_summary('2026-09-01', '2026-09-30')),
  '50.00/0.00/50.00/625.00/0.00/300.00 reports 1/0/0/1');
select t_check('the manager sees every report', (select count(*)::text from expense_reports where operator_id = '00000000-0000-0000-0000-0000000000c1'), '2');

\echo '── 4. Return for correction ──'
select t_fails('a return needs a reason', format('select return_expense_report(%L, %L)', :'wk', 'no'), '%Explain what needs correcting%');
select t_check('returned', return_expense_report(:'wk', 'Fuel receipt is for AED 120, not 100'), 'returned');
select t_check('a repeated return changes nothing', return_expense_report(:'wk', 'Fuel receipt is for AED 120, not 100'), 'returned');
select t_fails('a returned report can''t be approved', format('select approve_expense_report(%L, null)', :'wk'), '%Only a submitted report%');
select t_fails('a manager doesn''t edit the operator''s expense', $$update expenses set amount = 120 where description = 'Fuel Monday'$$, '%Return the report%');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_check('the operator reads the reason',
  (select note from expense_report_events where report_id = :'wk' and action = 'returned'), 'Fuel receipt is for AED 120, not 100');
update expenses set amount = 120 where description = 'Fuel Monday';
select t_check('resubmitted', submit_expense_report(:'wk'), 'submitted');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c3';
select t_check('approved', approve_expense_report(:'wk', 'Checked against receipts'), 'approved');
select t_check('a repeated approval changes nothing', approve_expense_report(:'wk', 'Checked against receipts'), 'approved');
select t_check('the official figures now include the approved week, each expense once',
  (select subscription || '/' || fuel || '/' || rent || '/' || total_expenditure || '/' || expense_count
   from business_performance_summary('2026-09-01', '2026-09-30')),
  '50.00/145.00/500.00/695.00/4');
select t_check('10. category totals reconcile with the expenses',
  (select sum(total)::text from expense_category_totals('2026-09-01', '2026-09-30')),
  (select total_expenditure::text from business_performance_summary('2026-09-01', '2026-09-30')));
select t_check('8. the week and the rest of September add up to the month: each expense counted once',
  (select ((select total_expenditure from business_performance_summary('2026-09-01', '2026-09-06'))
     + (select total_expenditure from business_performance_summary('2026-09-07', '2026-09-13'))
     + (select total_expenditure from business_performance_summary('2026-09-14', '2026-09-30')))::text
     || '|' || (select total_expenditure from business_performance_summary('2026-09-01', '2026-09-30'))),
  '695.00|695.00');
reset role;
select t_check('the history: created, submitted, returned, resubmitted, approved',
  (select string_agg(action, ',' order by created_at, action) from expense_report_events where report_id = :'wk'),
  'created,submitted,returned,resubmitted,approved');
select t_check('the operator was told of the return and the approval, once each',
  (select string_agg(type, ',' order by type) from notifications where profile_id = '00000000-0000-0000-0000-0000000000c1' and type like 'expense_report.%'),
  'expense_report.approved,expense_report.returned');

\echo '── 7. Approved: only an audited correction ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_fails('the operator can''t change an approved expense', $$update expenses set amount = 1 where description = 'Rent Sunday'$$, '%approved report%');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c3';
select t_fails('nor can a manager, directly', $$update expenses set amount = 450 where description = 'Rent Sunday'$$, '%approved report%');
select t_fails('a correction needs a reason',
  format('select correct_expense(%L, 450, %L, gen_random_uuid())', (select id from expenses where description = 'Rent Sunday'), 'no'), '%reason for the correction%');
select correct_expense((select id from expenses where description = 'Rent Sunday'), 450, 'Landlord refunded AED 50', '40000000-0000-4000-8000-0000000000f1') as corr \gset
select t_check('a repeated correction is the same one',
  correct_expense((select id from expenses where description = 'Rent Sunday'), 450, 'Landlord refunded AED 50', '40000000-0000-4000-8000-0000000000f1')::text, :'corr');
select t_check('the original amount is kept with the correction',
  (select original_amount || '→' || corrected_amount || ' ' || reason from expense_corrections where id = :'corr'), '500.00→450.00 Landlord refunded AED 50');
select t_check('the report stays approved, its approved total follows; the official figures too',
  (select status || ' ' || approved_total from expense_reports where id = :'wk') || ' ' ||
  (select total_expenditure::text from business_performance_summary('2026-09-01', '2026-09-30')),
  'approved 595.00 645.00');
select t_fails('a correction is only for approved operator expenses',
  format('select correct_expense(%L, 10, %L, gen_random_uuid())', (select id from expenses where description = 'Salary month-end'), 'Wrong amount'), '%approved operator report%');
reset role;
select t_fails('ATTACK: rewrite a correction (even the database owner)', format('update expense_corrections set corrected_amount = 1 where id = %L', :'corr'), '%can''t be changed%');
select t_fails('ATTACK: delete the history (even the database owner)', format('delete from expense_report_events where report_id = %L', :'wk'), '%can''t be changed%');
select t_check('every step is in the audit log',
  (select string_agg(distinct action, ',' order by action) from audit_logs where entity_type = 'expense_report'),
  'expense_report.approved,expense_report.created,expense_report.discarded,expense_report.resubmitted,expense_report.returned,expense_report.submitted');

\echo '── 13. Existing records ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c3';
select t_check('the pre-0052 manager expense is still there and counts', (select source || '/' || amount from expenses where description = 'Legacy software'), 'manager/50.00');
select t_spend('Office rent (manager)', 'Rent', 1000, '2026-09-20');
select t_check('a manager''s own expense counts at once (Manager Expenses page)',
  (select total_expenditure::text from business_performance_summary('2026-09-01', '2026-09-30')), '1645.00');
reset role;

\echo '── 15. Receipts ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_check('the operator reads their own receipt', (select count(*)::text from storage.objects where bucket_id = 'expense-receipts'), '1');
-- Since 0053 only the app's checked upload route writes to the bucket.
select t_fails('ATTACK: an upload straight to storage, skipping the server''s checks',
  $$insert into storage.objects (bucket_id, name, owner) values ('expense-receipts', '00000000-0000-0000-0000-0000000000c1/raw.pdf', auth.uid())$$, '%row-level security%');
select t_fails('ATTACK: upload into another operator''s folder',
  $$insert into storage.objects (bucket_id, name, owner) values ('expense-receipts', '00000000-0000-0000-0000-0000000000c2/x.pdf', auth.uid())$$, '%row-level security%');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c2';
select t_check('ATTACK: another operator can''t read the receipt', (select count(*)::text from storage.objects where bucket_id = 'expense-receipts'), '0');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c3';
select t_check('a manager can', (select count(*)::text from storage.objects where bucket_id = 'expense-receipts'), '1');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c4';
select t_fails('ATTACK: a driver uploads a receipt',
  $$insert into storage.objects (bucket_id, name, owner) values ('expense-receipts', '00000000-0000-0000-0000-0000000000c4/x.pdf', auth.uid())$$, '%row-level security%');
reset role;

\echo '── Page reads ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c1';
select t_check('the operator''s totals by category and review state',
  (select string_agg(name || ':' || state || '=' || total, ',' order by name, state) from my_expense_totals('2026-09-01', '2026-09-30')),
  'Fuel:approved=145.00,Rent:approved=450.00,Salary:draft=300.00');
select t_check('the operator''s reports, with live totals and receipts',
  (select string_agg(status || '=' || total || '/' || expense_count || '/' || receipt_count, ',' order by period_start) from expense_report_list()),
  'approved=595.00/3/1,draft=300.00/1/0');
select t_check('the history names who acted',
  (select string_agg(action || ':' || coalesce(actor_name, '-'), ',' order by created_at, action) from expense_report_history(:'wk')),
  'created:Exp Op One,submitted:Exp Op One,returned:Exp Manager,resubmitted:Exp Op One,approved:Exp Manager,corrected:Exp Manager');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c2';
select t_check('ATTACK: another operator reads none of it',
  (select count(*) from expense_report_list()) || '/' || (select count(*) from my_expense_totals('2026-09-01', '2026-09-30'))
    || '/' || (select count(*) from expense_report_history(:'wk')) || '/' || (select count(*) from expense_report_categories(:'wk')),
  '0/0/0/0');
set request.jwt.uid = '00000000-0000-0000-0000-0000000000c3';
select t_check('a manager lists September''s reports by status, with the operator',
  (select string_agg(operator_name || ':' || status, ',' order by period_start) from expense_report_list('2026-09-01', '2026-09-30')),
  'Exp Op One:approved,Exp Op One:draft');
select t_check('…filtered to one status', (select count(*)::text from expense_report_list('2026-09-01', '2026-09-30', 'approved')), '1');
reset role;

\echo 'expense-reports: all checks passed'
