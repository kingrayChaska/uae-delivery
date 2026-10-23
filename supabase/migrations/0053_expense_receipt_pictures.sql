-- Receipt pictures on expenses, in place of a typed reference number.
--
-- 0044 gave an expense a free-text `reference` ("Reference or receipt
-- no."); 0052 added one `receipt_path` per operator expense, uploaded by
-- the browser straight into the private expense-receipts bucket, where only
-- the Content-Type the browser claimed was checked. Now whoever records an
-- expense — a manager or an operator — attaches the receipt itself: one or
-- more pictures (or a PDF, as 0052 allowed), up to ten.
--
-- ── Model ────────────────────────────────────────────────────────────────
-- expense_receipt_files: one row per attached file — the expense, the
--   storage path ("<recorder's id>/receipt-<uuid>.<ext>"), and the type and
--   size STORAGE recorded for it (not what a request said), file name, and
--   order. Paths are stored, never URLs: files are opened through
--   short-lived signed links, which storage RLS only hands to the recorder
--   and to managers (0052's expense_receipts_select).
-- expenses.reference and expenses.receipt_path stay, untouched, on every
--   existing expense: nothing is deleted. Every receipt_path is copied into
--   expense_receipt_files below, which is from now on the only list of an
--   expense's receipts; the application no longer writes either column
--   (receipt_path is refused from clients so the two can't drift apart).
--
-- ── Uploads ──────────────────────────────────────────────────────────────
-- Browsers no longer write to the bucket (expense_receipts_insert is
-- dropped). Files arrive through the app's /api/expense-receipts route,
-- which checks the session (active manager or operator), the size, and the
-- file's actual bytes (JPEG, PNG, WebP or PDF signature), then stores it in
-- that user's own folder with the service role. So every object in the
-- bucket was checked on the server, whatever a client sends to Storage.
--
-- ── Attaching ────────────────────────────────────────────────────────────
-- save_expense() (SECURITY INVOKER) writes the expense through the caller's
-- own RLS and the 0044/0052 triggers exactly as the app's table writes did,
-- then set_expense_receipts() makes the receipt list match — one
-- transaction, so an expense is never saved with half its receipts.
-- set_expense_receipts() (SECURITY DEFINER) refuses unless:
--   * the caller is an active manager or operator and recorded the expense
--     (the files are in their folder; a colleague can't swap them);
--   * the expense is active and still editable — an operator's expense in a
--     submitted or approved report is locked, as 0052 locks the expense;
--   * every file is in the caller's folder, exists in the bucket, and isn't
--     attached to another expense; at most ten.
-- Receipts taken off an expense are deleted from the table and their paths
-- returned, so the app deletes the files too (no orphans). Every change is
-- in audit_logs. The table has no client write grants.
--
-- Report review: receipts follow their expense id, so submitting,
-- approving, returning or reporting on an expense report keeps them with
-- the right expense; expense_report_list() now counts them from here.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Table
-- ════════════════════════════════════════════════════════════════════════
create table expense_receipt_files (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses (id),
  storage_path text not null unique check (char_length(storage_path) between 3 and 300 and storage_path not like '%..%'),
  -- From storage's own record of the object; null only for receipts copied
  -- from 0052's receipt_path, whose metadata may be missing.
  content_type text check (content_type is null or content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer check (size_bytes is null or (size_bytes > 0 and size_bytes <= 5242880)),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  position smallint not null default 1 check (position between 1 and 10),
  uploaded_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create index expense_receipt_files_expense_idx on expense_receipt_files (expense_id, position);

-- Only set_expense_receipts() changes rows (it sets this flag).
create function enforce_expense_receipt_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(current_setting('app.expense_receipt_sync', true), '') is null then
    raise exception 'Receipts are changed by saving the expense';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function enforce_expense_receipt_rules() from public, anon, authenticated;

create trigger expense_receipt_files_guard
  before update or delete on expense_receipt_files
  for each row execute function enforce_expense_receipt_rules();

alter table expense_receipt_files enable row level security;

-- Whoever can read the expense (expenses_select: a manager every one, an
-- operator their own) can see which receipts it has. Opening a file is a
-- separate check by storage RLS.
create policy expense_receipt_files_select on expense_receipt_files
  for select using (expense_id in (select id from expenses));

revoke all on expense_receipt_files from anon;
revoke insert, update, delete on expense_receipt_files from authenticated;

-- ── Existing receipts ────────────────────────────────────────────────────
insert into expense_receipt_files (expense_id, storage_path, content_type, size_bytes, uploaded_by, created_at)
select
  x.id,
  x.receipt_path,
  case lower(substring(x.receipt_path from '\.([A-Za-z0-9]+)$'))
    when 'pdf' then 'application/pdf'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    when 'png' then 'image/png'
    when 'webp' then 'image/webp'
  end,
  null,
  x.created_by,
  x.created_at
from expenses x
where x.receipt_path is not null
on conflict (storage_path) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Storage: no uploads from browsers
-- ════════════════════════════════════════════════════════════════════════
-- Reads stay as 0052 set them (the recorder and managers). There are no
-- update or delete policies; the app's server removes files it has
-- checked are not attached to any expense.
drop policy expense_receipts_insert on storage.objects;

-- ════════════════════════════════════════════════════════════════════════
-- 3. The legacy column stays as it is
-- ════════════════════════════════════════════════════════════════════════
create function enforce_legacy_receipt_path()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and new.receipt_path is distinct from (case when tg_op = 'UPDATE' then old.receipt_path end)
  then
    raise exception 'Attach receipts as pictures';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_legacy_receipt_path() from public, anon, authenticated;

create trigger expenses_legacy_receipt_path
  before insert or update on expenses
  for each row execute function enforce_legacy_receipt_path();

-- ════════════════════════════════════════════════════════════════════════
-- 4. Attaching receipts
-- ════════════════════════════════════════════════════════════════════════
-- p_receipts: [{ "path": "...", "name": "IMG_0012.jpg" }, ...] in display
-- order — the expense's whole receipt list afterwards. Returns the paths
-- taken off, for the caller to delete from storage.
create function set_expense_receipts(p_expense_id uuid, p_receipts jsonb)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_expense expenses%rowtype;
  v_report_status text;
  v_paths text[];
  v_removed text[];
  v_added text[];
  v_item jsonb;
  v_path text;
  v_name text;
  v_object record;
  v_position integer := 0;
begin
  if v_actor is null or not exists (
    select 1 from profiles where id = v_actor and role in ('manager', 'operator') and active and deleted_at is null
  ) then
    raise exception 'Only managers and operators attach expense receipts';
  end if;

  select * into v_expense from expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found';
  end if;
  if v_expense.created_by <> v_actor then
    raise exception 'Only the person who recorded this expense can change its receipts';
  end if;
  if v_expense.status <> 'active' then
    raise exception 'Void expenses cannot be changed';
  end if;
  if v_expense.source = 'operator' and v_expense.report_id is not null then
    select status into v_report_status from expense_reports where id = v_expense.report_id for update;
    if v_report_status = 'submitted' then
      raise exception 'This expense is in a submitted report: it can''t be changed until a manager returns the report';
    elsif v_report_status = 'approved' then
      raise exception 'This expense is in an approved report: a manager corrects it with a correction';
    end if;
  end if;

  if p_receipts is null or jsonb_typeof(p_receipts) <> 'array' then
    raise exception 'Attach the receipts again';
  end if;
  if jsonb_array_length(p_receipts) > 10 then
    raise exception 'Attach at most 10 receipts to one expense';
  end if;

  select coalesce(array_agg(item ->> 'path'), '{}') into v_paths from jsonb_array_elements(p_receipts) item;
  if (select count(distinct p) from unnest(v_paths) p) <> cardinality(v_paths) or array_position(v_paths, null) is not null then
    raise exception 'Attach the receipts again';
  end if;

  perform set_config('app.expense_receipt_sync', 'on', true);

  -- Taken off: gone from the list.
  with gone as (
    delete from expense_receipt_files
    where expense_id = p_expense_id and not (storage_path = any (v_paths))
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_removed from gone;

  v_added := '{}';
  for v_item in select value from jsonb_array_elements(p_receipts) loop
    v_position := v_position + 1;
    v_path := v_item ->> 'path';
    v_name := left(nullif(btrim(regexp_replace(coalesce(v_item ->> 'name', ''), '[[:cntrl:]]', '', 'g')), ''), 200);

    if exists (select 1 from expense_receipt_files where storage_path = v_path and expense_id = p_expense_id) then
      update expense_receipt_files set position = v_position where storage_path = v_path and expense_id = p_expense_id;
      continue;
    end if;

    -- A new one: the caller's own upload, present in the bucket, free.
    if split_part(v_path, '/', 1) <> v_actor::text or v_path like '%..%' or v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
      raise exception 'Attach a receipt you uploaded yourself';
    end if;
    if exists (select 1 from expense_receipt_files where storage_path = v_path) then
      raise exception 'That receipt is already attached to another expense';
    end if;
    select o.metadata ->> 'mimetype' as mimetype, (o.metadata ->> 'size')::bigint as size into v_object
    from storage.objects o where o.bucket_id = 'expense-receipts' and o.name = v_path;
    if not found then
      raise exception 'That receipt upload wasn''t found. Upload it again';
    end if;
    if v_object.mimetype is not null and v_object.mimetype not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
      raise exception 'Upload a JPG, PNG, WebP or PDF receipt';
    end if;

    insert into expense_receipt_files (expense_id, storage_path, content_type, size_bytes, file_name, position, uploaded_by)
    values (p_expense_id, v_path, v_object.mimetype, case when v_object.size between 1 and 5242880 then v_object.size end, v_name, v_position, v_actor);
    v_added := v_added || v_path;
  end loop;

  perform set_config('app.expense_receipt_sync', '', true);

  if cardinality(v_added) > 0 or cardinality(v_removed) > 0 then
    insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
    values (v_actor, 'expense.receipts_changed', 'expense', p_expense_id,
      jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed), 'count', cardinality(v_paths)));
  end if;

  return v_removed;
end;
$$;

revoke execute on function set_expense_receipts(uuid, jsonb) from public, anon;
grant execute on function set_expense_receipts(uuid, jsonb) to authenticated;

-- The expense and its receipts in one transaction. SECURITY INVOKER: the
-- expense is written under the caller's own RLS and the 0044/0052 triggers
-- (who recorded it, its source and report, the edit locks, the audit row),
-- exactly as a table write from the app. A new expense's reference is left
-- empty; an edit never touches the reference recorded earlier.
-- p_receipts null = leave the receipts as they are (edits only).
create function save_expense(
  p_expense_id uuid,
  p_category_id uuid,
  p_description text,
  p_amount numeric,
  p_incurred_on date,
  p_payment_status text,
  p_paid_on date,
  p_vendor text,
  p_notes text,
  p_receipts jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_removed text[] := '{}';
begin
  if p_expense_id is null then
    insert into expenses (category_id, description, amount, incurred_on, payment_status, paid_on, vendor, notes, created_by)
    values (p_category_id, p_description, p_amount, p_incurred_on, p_payment_status,
      case when p_payment_status = 'paid' then p_paid_on end, p_vendor, p_notes, auth.uid())
    returning id into v_id;
  else
    update expenses
    set category_id = p_category_id,
        description = p_description,
        amount = p_amount,
        incurred_on = p_incurred_on,
        payment_status = p_payment_status,
        paid_on = case when p_payment_status = 'paid' then p_paid_on end,
        vendor = p_vendor,
        notes = p_notes
    where id = p_expense_id and status = 'active'
    returning id into v_id;
    if v_id is null then
      raise exception 'This expense can no longer be edited';
    end if;
  end if;

  if p_receipts is not null or p_expense_id is null then
    v_removed := set_expense_receipts(v_id, coalesce(p_receipts, '[]'::jsonb));
  end if;

  return jsonb_build_object('id', v_id, 'removed', to_jsonb(v_removed));
end;
$$;

revoke execute on function save_expense(uuid, uuid, text, numeric, date, text, date, text, text, jsonb) from public, anon;
grant execute on function save_expense(uuid, uuid, text, numeric, date, text, date, text, text, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Report lists count receipts from the new table
-- ════════════════════════════════════════════════════════════════════════
-- As 0052, except receipt_count: the report's active expenses with at
-- least one receipt.
create or replace function expense_report_list(p_from date default null, p_to date default null, p_status text default null)
returns table (
  id uuid, report_number text, operator_id uuid, operator_name text, period_kind text, period_start date, period_end date,
  status text, total numeric, expense_count bigint, receipt_count bigint, submitted_at timestamptz, submission_count integer,
  submitted_total numeric, approved_total numeric, decided_at timestamptz, decided_by_name text, decision_note text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.report_number, r.operator_id, op.full_name, r.period_kind, r.period_start, r.period_end, r.status,
    coalesce(sum(x.amount) filter (where x.status = 'active'), 0)::numeric(14, 2),
    count(x.id) filter (where x.status = 'active'),
    count(x.id) filter (where x.status = 'active' and exists (select 1 from expense_receipt_files f where f.expense_id = x.id)),
    r.submitted_at, r.submission_count, r.submitted_total, r.approved_total, r.decided_at, dp.full_name, r.decision_note, r.created_at
  from expense_reports r
  join profiles op on op.id = r.operator_id
  left join profiles dp on dp.id = r.decided_by
  left join expenses x on x.report_id = r.id
  where (is_manager() or r.operator_id = auth.uid())
    and (p_from is null or r.period_end >= p_from)
    and (p_to is null or r.period_start <= p_to)
    and (p_status is null or r.status = p_status)
  group by r.id, op.full_name, dp.full_name
  order by r.period_start desc, r.created_at desc;
$$;
