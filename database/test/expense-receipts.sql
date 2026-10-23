-- Run after database/test/run.sh (a fresh scratch database with every
-- migration applied). Checks migration 0053: receipt pictures on expenses —
-- several per expense, in order, saved with the expense in one step; only
-- the recorder's own checked uploads (present in the bucket, an accepted
-- type, attached nowhere else) can be attached; receipts lock with the
-- expense's report; taken-off receipts are returned for deletion; nobody
-- writes the table or the bucket directly; managers and the recorder read
-- them; references recorded earlier stay. Each check raises "FAIL ...".
--
-- Usage: su postgres -c "psql -d uae_delivery_test -f database/test/expense-receipts.sql"

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

-- Operators (…81, …82), managers (…83, …84), driver (…85).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000081', 'rc-op1@test.com',  '{"full_name":"Receipt Op One","phone":"0508100001"}'),
  ('00000000-0000-0000-0000-000000000082', 'rc-op2@test.com',  '{"full_name":"Receipt Op Two","phone":"0508100002"}'),
  ('00000000-0000-0000-0000-000000000083', 'rc-mgr1@test.com', '{"full_name":"Receipt Mgr One","phone":"0508100003"}'),
  ('00000000-0000-0000-0000-000000000084', 'rc-mgr2@test.com', '{"full_name":"Receipt Mgr Two","phone":"0508100004"}'),
  ('00000000-0000-0000-0000-000000000085', 'rc-drv@test.com',  '{"full_name":"Receipt Driver","phone":"0508100005"}');
alter table profiles disable trigger user;
update profiles set role = 'operator' where id in ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000082');
update profiles set role = 'manager' where id in ('00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000084');
update profiles set role = 'driver' where id = '00000000-0000-0000-0000-000000000085';
alter table profiles enable trigger user;
insert into staff_profiles (profile_id, employee_id) values
  ('00000000-0000-0000-0000-000000000081', 'EMP-R1'), ('00000000-0000-0000-0000-000000000082', 'EMP-R2'),
  ('00000000-0000-0000-0000-000000000083', 'EMP-R3'), ('00000000-0000-0000-0000-000000000084', 'EMP-R4');

-- Files as the app's checked upload route stores them: in the uploader's
-- folder, with storage's own record of type and size.
create function t_upload(p_folder text, p_name text, p_type text default 'image/jpeg') returns text language sql as $$
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('expense-receipts', p_folder || '/' || p_name, p_folder::uuid, jsonb_build_object('mimetype', p_type, 'size', 2048))
  returning name;
$$;
select t_upload('00000000-0000-0000-0000-000000000081', 'receipt-a.jpg');
select t_upload('00000000-0000-0000-0000-000000000081', 'receipt-b.png', 'image/png');
select t_upload('00000000-0000-0000-0000-000000000081', 'receipt-c.webp', 'image/webp');
select t_upload('00000000-0000-0000-0000-000000000081', 'receipt-d.pdf', 'application/pdf');
select t_upload('00000000-0000-0000-0000-000000000081', 'receipt-e.jpg');
select t_upload('00000000-0000-0000-0000-000000000081', 'receipt-html.jpg', 'text/html');
select t_upload('00000000-0000-0000-0000-000000000082', 'receipt-z.jpg');
select t_upload('00000000-0000-0000-0000-000000000083', 'receipt-m.jpg');
select t_upload('00000000-0000-0000-0000-000000000083', 'receipt-m2.jpg');
select g from generate_series(1, 11) g, lateral (select t_upload('00000000-0000-0000-0000-000000000081', 'many-' || g || '.jpg')) u;

create function t_cat(p_name text) returns uuid language sql as $$ select id from expense_categories where name = p_name $$;
grant execute on function t_cat(text) to authenticated;

-- save_expense() as the app calls it; p_receipts are paths (name = file name).
create function t_save(p_id uuid, p_label text, p_on date, p_paths text[] default null) returns jsonb language sql as $$
  select save_expense(p_id, t_cat('Fuel'), p_label, 75, p_on, 'paid', p_on, 'ENOC', null,
    case when p_paths is null then null else (select coalesce(jsonb_agg(jsonb_build_object('path', p, 'name', 'IMG ' || ord) order by ord), '[]') from unnest(p_paths) with ordinality u(p, ord)) end);
$$;
grant execute on function t_save(uuid, text, date, text[]) to authenticated;

create function t_receipts(p_label text) returns text language sql security definer as $$
  select coalesce(string_agg(split_part(f.storage_path, '/', 2) || ':' || coalesce(f.content_type, '?'), ',' order by f.position), '-')
  from expense_receipt_files f join expenses x on x.id = f.expense_id where x.description = p_label;
$$;
create function t_expense(p_label text) returns uuid language sql security definer as $$ select id from expenses where description = p_label $$;
grant execute on function t_receipts(text), t_expense(text) to authenticated;

-- An expense from before 0053, with a typed reference and a 0052 receipt
-- (written as the database: the app can no longer set either).
insert into expenses (category_id, description, amount, incurred_on, created_by, source, reference, receipt_path)
values (t_cat('Rent'), 'Legacy rent', 900, '2026-08-01', '00000000-0000-0000-0000-000000000083', 'manager', 'INV-778', '00000000-0000-0000-0000-000000000083/legacy.pdf');

-- ════════════════════════════════════════════════════════════════════════
\echo '── 1. Several receipt pictures, saved with the expense ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000081';
select t_check('a new expense with three pictures and a PDF',
  (select (t_save(null, 'Fuel trip', '2026-09-08', array[
    '00000000-0000-0000-0000-000000000081/receipt-a.jpg', '00000000-0000-0000-0000-000000000081/receipt-b.png',
    '00000000-0000-0000-0000-000000000081/receipt-c.webp', '00000000-0000-0000-0000-000000000081/receipt-d.pdf']) ->> 'removed')),
  '[]');
select t_check('linked to that expense, in order, typed by storage',
  t_receipts('Fuel trip'), 'receipt-a.jpg:image/jpeg,receipt-b.png:image/png,receipt-c.webp:image/webp,receipt-d.pdf:application/pdf');
select t_check('the recorder reads them', (select count(*)::text from expense_receipt_files where expense_id = t_expense('Fuel trip')), '4');
select t_check('…and their files', (select count(*)::text from storage.objects where bucket_id = 'expense-receipts' and name like '%/receipt-%' and name like '00000000-0000-0000-0000-000000000081/%'), '6');
select t_check('an edit that leaves receipts out keeps them',
  (select (t_save(t_expense('Fuel trip'), 'Fuel trip', '2026-09-08') ->> 'removed')), '[]');
select t_check('…all four still there', t_receipts('Fuel trip'), 'receipt-a.jpg:image/jpeg,receipt-b.png:image/png,receipt-c.webp:image/webp,receipt-d.pdf:application/pdf');
select t_check('reorder, take one off, add one: the taken-off path is returned for deletion',
  (select (t_save(t_expense('Fuel trip'), 'Fuel trip', '2026-09-08', array[
    '00000000-0000-0000-0000-000000000081/receipt-c.webp', '00000000-0000-0000-0000-000000000081/receipt-a.jpg',
    '00000000-0000-0000-0000-000000000081/receipt-d.pdf', '00000000-0000-0000-0000-000000000081/receipt-e.jpg']) ->> 'removed')),
  '["00000000-0000-0000-0000-000000000081/receipt-b.png"]');
select t_check('the new order', t_receipts('Fuel trip'), 'receipt-c.webp:image/webp,receipt-a.jpg:image/jpeg,receipt-d.pdf:application/pdf,receipt-e.jpg:image/jpeg');
select t_check('a new expense without receipts', (select (t_save(null, 'No receipt', '2026-09-09', array[]::text[]) ->> 'removed')), '[]');
select t_check('…has none', t_receipts('No receipt'), '-');
reset role;
select t_check('the change is audited',
  (select count(*)::text from audit_logs where action = 'expense.receipts_changed' and entity_id = t_expense('Fuel trip')), '2');

\echo '── 2. Only the recorder''s own checked uploads ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000081';
select t_fails('ATTACK: another operator''s file',
  $$select t_save(null, 'Stolen', '2026-09-08', array['00000000-0000-0000-0000-000000000082/receipt-z.jpg'])$$, '%receipt you uploaded yourself%');
select t_check('…and the refused expense wasn''t saved without it', (select count(*)::text from expenses where description = 'Stolen'), '0');
select t_fails('ATTACK: a path that climbs out of the folder',
  $$select t_save(null, 'Climb', '2026-09-08', array['00000000-0000-0000-0000-000000000081/../00000000-0000-0000-0000-000000000082/receipt-z.jpg'])$$, '%receipt you uploaded yourself%');
select t_fails('a file that was never uploaded',
  $$select t_save(null, 'Ghost', '2026-09-08', array['00000000-0000-0000-0000-000000000081/receipt-ghost.jpg'])$$, '%wasn''t found%');
select t_fails('ATTACK: a stored object that isn''t an accepted type',
  $$select t_save(null, 'Html', '2026-09-08', array['00000000-0000-0000-0000-000000000081/receipt-html.jpg'])$$, '%JPG, PNG, WebP or PDF%');
select t_fails('a receipt already on another expense',
  $$select t_save(null, 'Twice', '2026-09-08', array['00000000-0000-0000-0000-000000000081/receipt-a.jpg'])$$, '%already attached to another expense%');
select t_fails('the same receipt twice',
  $$select t_save(null, 'Dup', '2026-09-08', array['00000000-0000-0000-0000-000000000081/many-1.jpg', '00000000-0000-0000-0000-000000000081/many-1.jpg'])$$, '%Attach the receipts again%');
select t_fails('more than ten',
  $$select t_save(null, 'Many', '2026-09-08', (select array_agg('00000000-0000-0000-0000-000000000081/many-' || g || '.jpg') from generate_series(1, 11) g))$$, '%at most 10%');
select t_check('ten is fine',
  (select (t_save(null, 'Ten', '2026-09-08', (select array_agg('00000000-0000-0000-0000-000000000081/many-' || g || '.jpg' order by g) from generate_series(1, 10) g)) ->> 'removed')), '[]');

\echo '── 3. Nobody writes them directly ──'
select t_fails('ATTACK: insert a receipt row',
  format($$insert into expense_receipt_files (expense_id, storage_path, uploaded_by) values (%L, '00000000-0000-0000-0000-000000000081/many-11.jpg', auth.uid())$$, t_expense('No receipt')),
  '%row-level security%');
-- No update policy: an update matches no rows. Deletes aren't granted at all.
update expense_receipt_files set expense_id = t_expense('No receipt') where expense_id = t_expense('Fuel trip');
select t_fails('ATTACK: delete receipt rows',
  format($$delete from expense_receipt_files where expense_id = %L$$, t_expense('Fuel trip')), '%permission denied%');
select t_check('…direct updates and deletes change nothing', t_receipts('Fuel trip'), 'receipt-c.webp:image/webp,receipt-a.jpg:image/jpeg,receipt-d.pdf:application/pdf,receipt-e.jpg:image/jpeg');
select t_fails('ATTACK: an upload straight to the bucket, skipping the server''s checks',
  $$insert into storage.objects (bucket_id, name, owner) values ('expense-receipts', '00000000-0000-0000-0000-000000000081/raw.jpg', auth.uid())$$, '%row-level security%');
select t_fails('ATTACK: setting the legacy receipt column',
  format($$update expenses set receipt_path = '00000000-0000-0000-0000-000000000081/many-11.jpg' where id = %L$$, t_expense('No receipt')), '%Attach receipts as pictures%');
reset role;
select t_fails('even the database can''t edit a receipt row outside save_expense',
  $$update expense_receipt_files set position = 9 where position = 1$$, '%changed by saving the expense%');

\echo '── 4. Who reads them ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000082';
select t_check('ATTACK: another operator sees none of the rows', (select count(*)::text from expense_receipt_files), '0');
select t_check('ATTACK: …nor the files', (select count(*)::text from storage.objects where name like '00000000-0000-0000-0000-000000000081/%'), '0');
set request.jwt.uid = '00000000-0000-0000-0000-000000000085';
select t_check('ATTACK: a driver sees none', (select count(*)::text from expense_receipt_files), '0');
select t_fails('ATTACK: a driver can''t record an expense with receipts',
  $$select t_save(null, 'Driver', '2026-09-08', array[]::text[])$$, '%row-level security%');
set request.jwt.uid = '00000000-0000-0000-0000-000000000083';
select t_check('a manager reviewing sees the operator''s receipts', t_receipts('Fuel trip'),
  'receipt-c.webp:image/webp,receipt-a.jpg:image/jpeg,receipt-d.pdf:application/pdf,receipt-e.jpg:image/jpeg');
select t_check('…the rows and the files', (select count(*)::text from expense_receipt_files where expense_id = t_expense('Fuel trip')) || '/' ||
  (select count(*)::text from storage.objects where name like '00000000-0000-0000-0000-000000000081/receipt-%'), '4/6');
select t_fails('ATTACK: a manager swaps an operator''s receipts',
  format($$select set_expense_receipts(%L, '[]')$$, t_expense('Fuel trip')), '%Only the person who recorded%');
reset role;

\echo '── 5. Managers'' own expenses ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000083';
select t_check('a manager attaches pictures to their own expense',
  (select (t_save(null, 'Office fuel', '2026-09-10', array['00000000-0000-0000-0000-000000000083/receipt-m.jpg']) ->> 'removed')), '[]');
set request.jwt.uid = '00000000-0000-0000-0000-000000000084';
select t_check('a colleague edits it without touching its receipts',
  (select (t_save(t_expense('Office fuel'), 'Office fuel', '2026-09-10') ->> 'removed')), '[]');
select t_fails('ATTACK: …but can''t change them',
  format($$select t_save(%L, 'Office fuel', '2026-09-10', array[]::text[])$$, t_expense('Office fuel')), '%Only the person who recorded%');
select t_check('the receipt stayed', t_receipts('Office fuel'), 'receipt-m.jpg:image/jpeg');
reset role;

\echo '── 6. References and receipts recorded earlier stay ──'
-- Copied as the 0053 backfill copies every receipt_path (it ran before this
-- fixture existed).
insert into expense_receipt_files (expense_id, storage_path, content_type, uploaded_by)
select id, receipt_path, 'application/pdf', created_by from expenses where description = 'Legacy rent';
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000083';
select t_check('editing a legacy expense keeps its reference and receipt',
  (select (t_save(t_expense('Legacy rent'), 'Legacy rent', '2026-08-01') ->> 'removed')), '[]');
reset role;
select t_check('…reference, legacy column and receipt list unchanged',
  (select reference || ' ' || split_part(receipt_path, '/', 2) from expenses where description = 'Legacy rent') || ' ' || t_receipts('Legacy rent'),
  'INV-778 legacy.pdf legacy.pdf:application/pdf');
select t_check('a new expense never gets a reference', (select coalesce(reference, 'none') from expenses where description = 'Fuel trip'), 'none');

\echo '── 7. Receipts lock with the report ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000081';
select create_expense_report('week', '2026-09-07', '2026-09-13', gen_random_uuid()) as wk \gset
select t_check('a draft report: still editable', (select (t_save(t_expense('Fuel trip'), 'Fuel trip', '2026-09-08', array[
    '00000000-0000-0000-0000-000000000081/receipt-c.webp', '00000000-0000-0000-0000-000000000081/receipt-a.jpg',
    '00000000-0000-0000-0000-000000000081/receipt-d.pdf']) ->> 'removed')), '["00000000-0000-0000-0000-000000000081/receipt-e.jpg"]');
select t_check('submitted', submit_expense_report(:'wk'), 'submitted');
select t_fails('a submitted report''s receipts are locked',
  format($$select set_expense_receipts(%L, '[]')$$, t_expense('Fuel trip')), '%submitted report%');
select t_check('the report counts its expenses with receipts',
  (select expense_count || '/' || receipt_count from expense_report_list() where id = :'wk'), '3/2');
set request.jwt.uid = '00000000-0000-0000-0000-000000000083';
select t_check('returned', return_expense_report(:'wk', 'Add the missing receipt for the 9th'), 'returned');
set request.jwt.uid = '00000000-0000-0000-0000-000000000081';
select t_check('a returned report: receipts can be fixed',
  (select (t_save(t_expense('No receipt'), 'No receipt', '2026-09-09', array['00000000-0000-0000-0000-000000000081/receipt-e.jpg']) ->> 'removed')), '[]');
select t_check('resubmitted', submit_expense_report(:'wk'), 'submitted');
set request.jwt.uid = '00000000-0000-0000-0000-000000000083';
select t_check('approved', approve_expense_report(:'wk', 'Receipts checked'), 'approved');
set request.jwt.uid = '00000000-0000-0000-0000-000000000081';
select t_fails('an approved report''s receipts are locked',
  format($$select set_expense_receipts(%L, '[]')$$, t_expense('No receipt')), '%approved report%');
select t_check('…and stay with their expenses', t_receipts('No receipt') || ' | ' || t_receipts('Fuel trip'),
  'receipt-e.jpg:image/jpeg | receipt-c.webp:image/webp,receipt-a.jpg:image/jpeg,receipt-d.pdf:application/pdf');
select t_check('the approved figures are unchanged by receipts',
  (select expense_count || '/' || receipt_count || '/' || total from expense_report_list() where id = :'wk'), '3/3/225.00');
reset role;

\echo '── 8. A void expense keeps its receipts ──'
set role authenticated;
set request.jwt.uid = '00000000-0000-0000-0000-000000000083';
update expenses set status = 'void', void_reason = 'Entered twice' where description = 'Office fuel';
select t_fails('its receipts can''t change', format($$select set_expense_receipts(%L, '[]')$$, t_expense('Office fuel')), '%Void expenses cannot be changed%');
select t_check('…and are still listed', t_receipts('Office fuel'), 'receipt-m.jpg:image/jpeg');
reset role;

\echo 'expense-receipts: all checks passed'
