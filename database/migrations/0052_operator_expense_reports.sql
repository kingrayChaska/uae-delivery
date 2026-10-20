-- Operator expense reports, reviewed by managers.
--
-- 0044 made expenses manager-only: a manager recorded each one and it
-- counted in the performance report at once. Now operators record their
-- own operational expenses, group them into weekly, monthly or custom
-- reports, and submit them; a manager approves a report or returns it for
-- correction. Decisions confirmed with the business (2026-10-20):
--   * Official performance figures count manager-recorded expenses (every
--     expense before this migration among them, so no historical figure
--     moves) and operator expenses whose report is APPROVED. Submitted ones
--     are shown apart as "awaiting review"; drafts and returned ones don't
--     count.
--   * Managers keep their Expenses page for costs they record themselves.
--   * An operator sees only their own expenses and reports.
--   * An operator's report periods never overlap: each expense belongs to
--     at most one report, so weekly and monthly views can't count it twice.
--
-- ── Model ────────────────────────────────────────────────────────────────
-- expenses (0044) gains:
--   source      'manager' | 'operator' — set by the database from who
--               records it; never changes.
--   report_id   the operator's report whose period holds incurred_on, set
--               by the database (an expense dated in a period already
--               submitted or approved is refused).
--   receipt_path  a file in the private expense-receipts bucket, in the
--               recorder's own folder.
-- expense_reports: number EXR-YYYY-NNNNNN, operator, period kind and dates,
--   status draft → submitted → approved | returned (→ submitted again),
--   snapshots of the total at each submission and at approval.
-- expense_report_events: the report's history — created, submitted,
--   resubmitted, approved, returned (with the manager's reason), corrected.
--   The operator reads their own; managers read all.
-- expense_corrections: a manager's correction to an approved expense —
--   original and corrected amount, reason, who and when. The expense then
--   carries the corrected amount; nothing is lost.
--
-- Who may change what (expenses_operator_rules, on top of 0044's rules):
--   operator  their own expenses, while unreported or in a draft/returned
--             report; never one in a submitted or approved report.
--   manager   their own (manager) expenses as before; an operator's only
--             through correct_expense() once approved — otherwise they
--             return the report.
-- Every report transition is a SECURITY DEFINER function that checks the
-- caller from the session, locks the report row and accepts a repeat
-- (returning the current state, notifying no one twice).
--
-- Weeks are Monday–Sunday and months calendar months, in Asia/Dubai
-- (expense dates are Dubai calendar dates, as in 0044).

-- ════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ════════════════════════════════════════════════════════════════════════
create sequence expense_report_number_seq;

create table expense_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null unique,
  operator_id uuid not null references profiles (id),
  period_kind text not null check (period_kind in ('week', 'month', 'custom')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'returned')),
  submitted_at timestamptz,
  submission_count integer not null default 0 check (submission_count >= 0),
  submitted_total numeric(12, 2),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  approved_total numeric(12, 2),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_reports_period check (period_end >= period_start and period_end - period_start <= 365),
  constraint expense_reports_request_unique unique (operator_id, client_request_id),
  constraint expense_reports_state check (
    (status = 'draft' and decided_at is null)
    or (status = 'submitted' and submitted_at is not null)
    or (status in ('approved', 'returned') and decided_by is not null and decided_at is not null)
  )
);

create index expense_reports_operator_idx on expense_reports (operator_id, period_start);
create index expense_reports_period_idx on expense_reports (period_start, period_end);
create index expense_reports_status_idx on expense_reports (status, submitted_at desc);

create trigger expense_reports_set_updated_at
  before update on expense_reports
  for each row execute function set_updated_at();

create table expense_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references expense_reports (id),
  action text not null check (action in ('created', 'submitted', 'resubmitted', 'approved', 'returned', 'corrected')),
  actor_id uuid references profiles (id),
  note text check (note is null or char_length(note) <= 1000),
  total numeric(12, 2),
  created_at timestamptz not null default now()
);

create index expense_report_events_report_idx on expense_report_events (report_id, created_at);

create table expense_corrections (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses (id),
  report_id uuid references expense_reports (id),
  original_amount numeric(12, 2) not null,
  corrected_amount numeric(12, 2) not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  corrected_by uuid not null references profiles (id),
  client_request_id uuid not null unique,
  created_at timestamptz not null default now()
);

create index expense_corrections_expense_idx on expense_corrections (expense_id, created_at);

alter table expenses
  add column source text not null default 'manager' check (source in ('manager', 'operator')),
  add column report_id uuid references expense_reports (id),
  add column receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300),
  add constraint expenses_report_source check (report_id is null or source = 'operator');

create index expenses_report_idx on expenses (report_id) where report_id is not null;
create index expenses_operator_idx on expenses (created_by, incurred_on) where source = 'operator';

-- Events and corrections are append-only, for every caller.
create function enforce_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only discard_expense_report() removes a never-submitted draft's events.
  if tg_op = 'DELETE' and nullif(current_setting('app.expense_report_discard', true), '') is not null then
    return old;
  end if;
  raise exception 'This record can''t be changed or deleted';
end;
$$;

revoke execute on function enforce_append_only() from public, anon, authenticated;

create trigger expense_report_events_append_only
  before update or delete on expense_report_events
  for each row execute function enforce_append_only();
create trigger expense_corrections_append_only
  before update or delete on expense_corrections
  for each row execute function enforce_append_only();

create function assign_expense_report_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.report_number := 'EXR-' || to_char(now() at time zone 'Asia/Dubai', 'YYYY') || '-'
    || lpad(nextval('expense_report_number_seq')::text, 6, '0');
  return new;
end;
$$;

revoke execute on function assign_expense_report_number() from public, anon, authenticated;

create trigger expense_reports_number
  before insert on expense_reports
  for each row execute function assign_expense_report_number();

-- ════════════════════════════════════════════════════════════════════════
-- 2. Access
-- ════════════════════════════════════════════════════════════════════════
create function is_active_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'operator' and active and deleted_at is null);
$$;

revoke execute on function is_active_operator() from public, anon;
grant execute on function is_active_operator() to authenticated;

-- Categories: operators read them (to pick one); only managers change them.
drop policy expense_categories_select on expense_categories;
create policy expense_categories_select on expense_categories
  for select using ((select is_manager()) or (select is_active_operator()));

-- Expenses: managers every one (as 0044); an operator their own.
drop policy expenses_select on expenses;
create policy expenses_select on expenses
  for select using ((select is_manager()) or (source = 'operator' and created_by = (select auth.uid())));
drop policy expenses_insert on expenses;
create policy expenses_insert on expenses
  for insert with check (((select is_manager()) or (select is_active_operator())) and created_by = (select auth.uid()));
drop policy expenses_update on expenses;
create policy expenses_update on expenses
  for update
  using ((select is_manager()) or (source = 'operator' and created_by = (select auth.uid()) and (select is_active_operator())))
  with check ((select is_manager()) or (source = 'operator' and created_by = (select auth.uid()) and (select is_active_operator())));

alter table expense_reports enable row level security;
alter table expense_report_events enable row level security;
alter table expense_corrections enable row level security;

create policy expense_reports_select on expense_reports
  for select using ((select is_manager()) or operator_id = (select auth.uid()));
create policy expense_report_events_select on expense_report_events
  for select using (
    (select is_manager()) or exists (select 1 from expense_reports r where r.id = report_id and r.operator_id = (select auth.uid()))
  );
create policy expense_corrections_select on expense_corrections
  for select using (
    (select is_manager()) or exists (select 1 from expenses x where x.id = expense_id and x.created_by = (select auth.uid()) and x.source = 'operator')
  );
-- No write policies or grants: only the functions below write these.
revoke insert, update, delete on expense_reports, expense_report_events, expense_corrections from anon, authenticated;

-- Receipts: private; uploaded into the recorder's own folder; readable by
-- that person and by managers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy expense_receipts_insert on storage.objects
  for insert
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_manager() or public.is_active_operator())
  );

create policy expense_receipts_select on storage.objects
  for select
  using (
    bucket_id = 'expense-receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_manager())
  );

-- ════════════════════════════════════════════════════════════════════════
-- 3. The rules on an expense
-- ════════════════════════════════════════════════════════════════════════
-- The operator's report whose period holds a date, locked; null if none.
create function operator_report_for(p_operator uuid, p_day date)
returns expense_reports
language sql
security definer
set search_path = public
as $$
  select * from expense_reports
  where operator_id = p_operator and p_day between period_start and period_end
  for update;
$$;

revoke execute on function operator_report_for(uuid, date) from public, anon, authenticated;

create function enforce_operator_expense_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client boolean := coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon');
  v_correction boolean := nullif(current_setting('app.expense_correction', true), '') is not null;
  v_manager boolean := is_manager();
  v_old_report expense_reports%rowtype;
  v_target expense_reports%rowtype;
begin
  if tg_op = 'INSERT' then
    -- Who recorded it decides its source; a client can't attach it to a report.
    if v_client then
      new.source := case when v_manager then 'manager' else 'operator' end;
      new.report_id := null;
    end if;
  else
    if new.source is distinct from old.source or new.created_by is distinct from old.created_by then
      raise exception 'Who recorded an expense can''t be changed';
    end if;
    if v_client and not v_correction and new.report_id is distinct from old.report_id and new.incurred_on is not distinct from old.incurred_on then
      raise exception 'Expenses are added to reports by their date';
    end if;

    if old.source = 'operator' and not v_correction then
      if old.report_id is not null then
        select * into v_old_report from expense_reports where id = old.report_id for update;
        if v_old_report.status = 'submitted' then
          raise exception 'This expense is in a submitted report: it can''t be changed until a manager returns the report';
        end if;
        if v_old_report.status = 'approved' then
          raise exception 'This expense is in an approved report: a manager corrects it with a correction';
        end if;
      end if;
      -- A manager doesn't edit an operator's expense: they return the
      -- report (or correct it once approved).
      if v_client and v_manager then
        raise exception 'Return the report to the operator to change their expense';
      end if;
    end if;
  end if;

  if new.receipt_path is not null and (tg_op = 'INSERT' or new.receipt_path is distinct from old.receipt_path) then
    if split_part(new.receipt_path, '/', 1) <> new.created_by::text or new.receipt_path like '%..%' then
      raise exception 'Attach a receipt you uploaded yourself';
    end if;
  end if;

  -- Which report holds it: the one whose period covers its date.
  if new.source = 'operator' and not v_correction
    and (tg_op = 'INSERT' or new.incurred_on is distinct from old.incurred_on)
  then
    v_target := operator_report_for(new.created_by, new.incurred_on);
    if v_target.id is null then
      new.report_id := null;
    elsif v_target.status in ('draft', 'returned') then
      new.report_id := v_target.id;
    else
      raise exception 'The report for % has already been % — choose a date outside it',
        to_char(new.incurred_on, 'DD Mon YYYY'), v_target.status;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function enforce_operator_expense_rules() from public, anon, authenticated;

-- After 0044's expenses_enforce_rules (BEFORE triggers fire by name).
create trigger expenses_operator_rules
  before insert or update on expenses
  for each row execute function enforce_operator_expense_rules();

-- ════════════════════════════════════════════════════════════════════════
-- 4. Reports
-- ════════════════════════════════════════════════════════════════════════
create function require_expense_operator()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_active_operator() then
    raise exception 'Only operators prepare expense reports';
  end if;
  return auth.uid();
end;
$$;

revoke execute on function require_expense_operator() from public, anon, authenticated;

create function require_expense_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'manager' and active and deleted_at is null) then
    raise exception 'Only a manager reviews expense reports';
  end if;
  return auth.uid();
end;
$$;

revoke execute on function require_expense_manager() from public, anon, authenticated;

-- The report's live figures: active expenses in it.
create function expense_report_total(p_report_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric(12, 2) from expenses where report_id = p_report_id and status = 'active';
$$;

revoke execute on function expense_report_total(uuid) from public, anon, authenticated;

-- A report for a week (Monday–Sunday), a calendar month, or a custom
-- range. Takes in every unreported expense of the operator in it.
create function create_expense_report(p_kind text, p_start date, p_end date, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := require_expense_operator();
  v_existing expense_reports%rowtype;
  v_clash expense_reports%rowtype;
  v_id uuid;
begin
  if p_request_id is null then
    raise exception 'Missing request id';
  end if;
  if p_kind not in ('week', 'month', 'custom') then
    raise exception 'Choose a weekly, monthly or custom report';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Choose a valid reporting period';
  end if;
  if p_kind = 'week' and (extract(isodow from p_start) <> 1 or p_end <> p_start + 6) then
    raise exception 'A weekly report runs Monday to Sunday';
  end if;
  if p_kind = 'month' and (p_start <> date_trunc('month', p_start)::date
    or p_end <> (date_trunc('month', p_start) + interval '1 month - 1 day')::date) then
    raise exception 'A monthly report covers one calendar month';
  end if;
  if p_end - p_start > 92 then
    raise exception 'A custom report can cover at most 93 days';
  end if;
  if p_start > (now() at time zone 'Asia/Dubai')::date then
    raise exception 'A report can''t start in the future';
  end if;

  -- One operator's reports are created one at a time, so two can't overlap.
  perform pg_advisory_xact_lock(hashtextextended('expense_reports:' || v_operator::text, 0));

  select * into v_existing from expense_reports where operator_id = v_operator and client_request_id = p_request_id;
  if found then
    return v_existing.id;
  end if;

  select * into v_clash from expense_reports
  where operator_id = v_operator and period_start <= p_end and period_end >= p_start
  order by period_start limit 1;
  if found then
    raise exception 'This period overlaps your report % (% to %)', v_clash.report_number,
      to_char(v_clash.period_start, 'DD Mon YYYY'), to_char(v_clash.period_end, 'DD Mon YYYY');
  end if;

  insert into expense_reports (operator_id, period_kind, period_start, period_end, client_request_id)
  values (v_operator, p_kind, p_start, p_end, p_request_id)
  returning id into v_id;

  perform set_config('app.expense_correction', 'attach', true);
  update expenses set report_id = v_id
  where source = 'operator' and created_by = v_operator and report_id is null and status = 'active'
    and incurred_on between p_start and p_end;
  perform set_config('app.expense_correction', '', true);

  insert into expense_report_events (report_id, action, actor_id, total)
  values (v_id, 'created', v_operator, expense_report_total(v_id));
  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (v_operator, 'expense_report.created', 'expense_report', v_id,
    jsonb_build_object('kind', p_kind, 'from', p_start, 'to', p_end));
  return v_id;
end;
$$;

revoke execute on function create_expense_report(text, date, date, uuid) from public, anon;
grant execute on function create_expense_report(text, date, date, uuid) to authenticated;

-- A draft that was never submitted can be discarded (its expenses go back
-- to being unreported). Anything ever submitted stays on record.
create function discard_expense_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := require_expense_operator();
  v_report expense_reports%rowtype;
begin
  select * into v_report from expense_reports where id = p_report_id and operator_id = v_operator for update;
  if not found then
    raise exception 'Report not found';
  end if;
  if v_report.status <> 'draft' or v_report.submission_count > 0 then
    raise exception 'Only a draft that was never submitted can be discarded';
  end if;
  -- A void expense is frozen (0044) and stays where it is, so a report
  -- holding one stays on record.
  if exists (select 1 from expenses where report_id = p_report_id and status = 'void') then
    raise exception 'This report holds a voided expense, so it stays on record';
  end if;
  perform set_config('app.expense_correction', 'detach', true);
  update expenses set report_id = null where report_id = p_report_id;
  perform set_config('app.expense_correction', '', true);
  -- The report's own events go with it (append-only otherwise).
  perform set_config('app.expense_report_discard', 'on', true);
  delete from expense_report_events where report_id = p_report_id;
  perform set_config('app.expense_report_discard', '', true);
  delete from expense_reports where id = p_report_id;
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value)
  values (v_operator, 'expense_report.discarded', 'expense_report', p_report_id, to_jsonb(v_report));
end;
$$;

revoke execute on function discard_expense_report(uuid) from public, anon;
grant execute on function discard_expense_report(uuid) to authenticated;

create function submit_expense_report(p_report_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := require_expense_operator();
  v_report expense_reports%rowtype;
  v_total numeric(12, 2);
  v_count integer;
  v_name text;
  v_action text;
begin
  select * into v_report from expense_reports where id = p_report_id and operator_id = v_operator for update;
  if not found then
    raise exception 'Report not found';
  end if;
  -- A repeated click: nothing changes, nobody is told twice.
  if v_report.status in ('submitted', 'approved') then
    return v_report.status;
  end if;

  select count(*), coalesce(sum(amount), 0) into v_count, v_total
  from expenses where report_id = p_report_id and status = 'active';
  if v_count = 0 then
    raise exception 'Add at least one expense before submitting this report';
  end if;

  v_action := case when v_report.submission_count > 0 then 'resubmitted' else 'submitted' end;
  update expense_reports
  set status = 'submitted', submitted_at = now(), submission_count = submission_count + 1, submitted_total = v_total
  where id = p_report_id;

  insert into expense_report_events (report_id, action, actor_id, total) values (p_report_id, v_action, v_operator, v_total);
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_operator, 'expense_report.' || v_action, 'expense_report', p_report_id,
    jsonb_build_object('status', v_report.status), jsonb_build_object('status', 'submitted', 'total', v_total, 'expenses', v_count));

  select coalesce(full_name, 'An operator') into v_name from profiles where id = v_operator;
  perform notify_role('manager', 'expense_report.submitted', 'Expense report to review',
    v_name || ' ' || v_action || ' ' || v_report.report_number || ' (AED ' || to_char(v_total, 'FM999999990.00') || ').');
  return 'submitted';
end;
$$;

revoke execute on function submit_expense_report(uuid) from public, anon;
grant execute on function submit_expense_report(uuid) to authenticated;

create function approve_expense_report(p_report_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager uuid := require_expense_manager();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_report expense_reports%rowtype;
  v_total numeric(12, 2);
begin
  if char_length(v_note) > 1000 then
    raise exception 'Keep the note under 1000 characters';
  end if;
  select * into v_report from expense_reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found';
  end if;
  if v_report.status = 'approved' then
    return 'approved';
  end if;
  if v_report.status <> 'submitted' then
    raise exception 'Only a submitted report can be approved (this one is %)', v_report.status;
  end if;

  v_total := expense_report_total(p_report_id);
  update expense_reports
  set status = 'approved', decided_by = v_manager, decided_at = now(), decision_note = v_note, approved_total = v_total
  where id = p_report_id;

  insert into expense_report_events (report_id, action, actor_id, note, total) values (p_report_id, 'approved', v_manager, v_note, v_total);
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_manager, 'expense_report.approved', 'expense_report', p_report_id,
    jsonb_build_object('status', 'submitted'), jsonb_build_object('status', 'approved', 'total', v_total, 'note', v_note));
  insert into notifications (profile_id, type, title, body)
  values (v_report.operator_id, 'expense_report.approved', 'Expense report approved',
    v_report.report_number || ' (AED ' || to_char(v_total, 'FM999999990.00') || ') was approved.');
  return 'approved';
end;
$$;

revoke execute on function approve_expense_report(uuid, text) from public, anon;
grant execute on function approve_expense_report(uuid, text) to authenticated;

create function return_expense_report(p_report_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager uuid := require_expense_manager();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_report expense_reports%rowtype;
begin
  if char_length(v_reason) < 5 or char_length(v_reason) > 1000 then
    raise exception 'Explain what needs correcting (5 to 1000 characters)';
  end if;
  select * into v_report from expense_reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found';
  end if;
  if v_report.status = 'returned' and v_report.decision_note = v_reason then
    return 'returned';
  end if;
  if v_report.status <> 'submitted' then
    raise exception 'Only a submitted report can be returned (this one is %)', v_report.status;
  end if;

  update expense_reports
  set status = 'returned', decided_by = v_manager, decided_at = now(), decision_note = v_reason
  where id = p_report_id;

  insert into expense_report_events (report_id, action, actor_id, note, total)
  values (p_report_id, 'returned', v_manager, v_reason, expense_report_total(p_report_id));
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_manager, 'expense_report.returned', 'expense_report', p_report_id,
    jsonb_build_object('status', 'submitted'), jsonb_build_object('status', 'returned', 'reason', v_reason));
  insert into notifications (profile_id, type, title, body)
  values (v_report.operator_id, 'expense_report.returned', 'Expense report returned',
    v_report.report_number || ' needs correcting: ' || left(v_reason, 200));
  return 'returned';
end;
$$;

revoke execute on function return_expense_report(uuid, text) from public, anon;
grant execute on function return_expense_report(uuid, text) to authenticated;

-- A manager corrects the amount of an expense in an approved report. The
-- original stays in expense_corrections (and the audit log); the report
-- stays approved, and its approved total follows.
create function correct_expense(p_expense_id uuid, p_amount numeric, p_reason text, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager uuid := require_expense_manager();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_expense expenses%rowtype;
  v_report expense_reports%rowtype;
  v_existing expense_corrections%rowtype;
  v_id uuid;
begin
  if p_request_id is null then
    raise exception 'Missing request id';
  end if;
  select * into v_existing from expense_corrections where client_request_id = p_request_id;
  if found then
    return v_existing.id;
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Give a reason for the correction (5 to 500 characters)';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter an amount greater than AED 0 with at most two decimals';
  end if;

  select * into v_expense from expenses where id = p_expense_id for update;
  if not found or v_expense.source <> 'operator' or v_expense.report_id is null then
    raise exception 'Only an expense in an approved operator report is corrected this way';
  end if;
  select * into v_report from expense_reports where id = v_expense.report_id for update;
  if v_report.status <> 'approved' then
    raise exception 'Only an expense in an approved operator report is corrected this way';
  end if;
  if v_expense.status <> 'active' then
    raise exception 'Void expenses cannot be changed';
  end if;
  if p_amount = v_expense.amount then
    raise exception 'The corrected amount is the same as the current one';
  end if;

  insert into expense_corrections (expense_id, report_id, original_amount, corrected_amount, reason, corrected_by, client_request_id)
  values (v_expense.id, v_report.id, v_expense.amount, p_amount, v_reason, v_manager, p_request_id)
  returning id into v_id;

  perform set_config('app.expense_correction', 'on', true);
  update expenses set amount = p_amount where id = v_expense.id;
  update expense_reports set approved_total = expense_report_total(v_report.id) where id = v_report.id;
  perform set_config('app.expense_correction', '', true);

  insert into expense_report_events (report_id, action, actor_id, note, total)
  values (v_report.id, 'corrected', v_manager,
    left(format('%s: AED %s → AED %s. %s', v_expense.description, to_char(v_expense.amount, 'FM999999990.00'),
      to_char(p_amount, 'FM999999990.00'), v_reason), 1000),
    expense_report_total(v_report.id));
  insert into notifications (profile_id, type, title, body)
  values (v_report.operator_id, 'expense_report.corrected', 'Approved expense corrected',
    v_report.report_number || ': ' || v_expense.description || ' corrected to AED ' || to_char(p_amount, 'FM999999990.00') || '.');
  return v_id;
end;
$$;

revoke execute on function correct_expense(uuid, numeric, text, uuid) from public, anon;
grant execute on function correct_expense(uuid, numeric, text, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Official figures: manager-recorded + approved operator expenses
-- ════════════════════════════════════════════════════════════════════════
create function expense_is_official(p_source text, p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_source = 'manager'
    or exists (select 1 from expense_reports r where r.id = p_report_id and r.status = 'approved');
$$;

revoke execute on function expense_is_official(text, uuid) from public, anon;
grant execute on function expense_is_official(text, uuid) to authenticated;

-- As 0044 (with 0051's zero cash handling, which comes from
-- financial_shipment_lines), expenses filtered to the official ones.
create or replace function business_performance_summary(p_from date, p_to date)
returns table (
  merchant_service_revenue numeric,
  merchant_return_revenue numeric,
  merchant_cash_handling_revenue numeric,
  individual_revenue numeric,
  other_revenue numeric,
  total_revenue numeric,
  merchant_cod_collected numeric,
  delivered_count bigint,
  merchant_delivered_count bigint,
  individual_delivered_count bigint,
  returned_count bigint,
  fuel numeric,
  subscription numeric,
  salary numeric,
  rent numeric,
  other_expenses numeric,
  total_expenditure numeric,
  expense_count bigint,
  profit_after_fuel numeric,
  profit_after_subscription numeric,
  profit_after_salary numeric,
  profit_after_rent numeric,
  net_operating_profit numeric,
  break_even_revenue numeric,
  break_even_gap numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  e record;
  v_total_revenue numeric(14, 2);
  v_total_exp numeric(14, 2);
begin
  if not (select is_manager()) then
    raise exception 'Only a manager can view the performance report';
  end if;
  perform assert_report_period(p_from, p_to);

  select
    coalesce(sum(l.service_charge) filter (where l.is_merchant), 0)::numeric(14, 2) as m_service,
    coalesce(sum(l.return_charge) filter (where l.is_merchant), 0)::numeric(14, 2) as m_return,
    coalesce(sum(l.cash_handling_fee) filter (where l.is_merchant), 0)::numeric(14, 2) as m_handling,
    coalesce(sum(l.service_charge) filter (where not l.is_merchant), 0)::numeric(14, 2) as i_service,
    coalesce(sum(l.cod_collected) filter (where l.is_merchant), 0)::numeric(14, 2) as m_cod,
    count(*) filter (where l.event = 'delivered') as delivered,
    count(*) filter (where l.event = 'delivered' and l.is_merchant) as m_delivered,
    count(*) filter (where l.event = 'delivered' and not l.is_merchant) as i_delivered,
    count(*) filter (where l.event = 'returned') as returned
  into r
  from financial_shipment_lines(p_from, p_to, null) l;

  select
    coalesce(sum(x.amount) filter (where c.profit_group = 'fuel'), 0)::numeric(14, 2) as fuel,
    coalesce(sum(x.amount) filter (where c.profit_group = 'subscription'), 0)::numeric(14, 2) as subscription,
    coalesce(sum(x.amount) filter (where c.profit_group = 'salary'), 0)::numeric(14, 2) as salary,
    coalesce(sum(x.amount) filter (where c.profit_group = 'rent'), 0)::numeric(14, 2) as rent,
    coalesce(sum(x.amount) filter (where c.profit_group = 'other'), 0)::numeric(14, 2) as other,
    count(x.id) as n
  into e
  from expenses x
  join expense_categories c on c.id = x.category_id
  where x.status = 'active' and x.incurred_on between p_from and p_to
    and expense_is_official(x.source, x.report_id);

  v_total_revenue := r.m_service + r.m_return + r.m_handling + r.i_service;
  v_total_exp := e.fuel + e.subscription + e.salary + e.rent + e.other;

  return query select
    r.m_service, r.m_return, r.m_handling, r.i_service, 0::numeric(14, 2), v_total_revenue,
    r.m_cod, r.delivered, r.m_delivered, r.i_delivered, r.returned,
    e.fuel, e.subscription, e.salary, e.rent, e.other, v_total_exp, e.n,
    (v_total_revenue - e.fuel)::numeric(14, 2),
    (v_total_revenue - e.fuel - e.subscription)::numeric(14, 2),
    (v_total_revenue - e.fuel - e.subscription - e.salary)::numeric(14, 2),
    (v_total_revenue - e.fuel - e.subscription - e.salary - e.rent)::numeric(14, 2),
    (v_total_revenue - v_total_exp)::numeric(14, 2),
    v_total_exp,
    greatest(v_total_exp - v_total_revenue, 0)::numeric(14, 2);
end;
$$;

create or replace function expense_category_totals(p_from date, p_to date)
returns table (category_id uuid, name text, profit_group text, is_system boolean, active boolean, total numeric, expense_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (select is_manager()) then
    raise exception 'Only a manager can view the performance report';
  end if;
  perform assert_report_period(p_from, p_to);

  return query
  select c.id, c.name, c.profit_group, c.is_system, c.active,
    coalesce(sum(x.amount), 0)::numeric(14, 2), count(x.id)
  from expense_categories c
  left join expenses x on x.category_id = c.id and x.status = 'active' and x.incurred_on between p_from and p_to
    and expense_is_official(x.source, x.report_id)
  group by c.id
  having c.active or count(x.id) > 0
  order by array_position(array['salary', 'rent', 'fuel', 'subscription', 'other'], c.profit_group), c.is_system desc, c.name;
end;
$$;

-- Where the period's expenses stand: official (manager-recorded / approved
-- operator), awaiting review, returned, and not yet submitted. Each active
-- expense in exactly one bucket. Managers only.
create function expense_review_summary(p_from date, p_to date)
returns table (
  manager_recorded numeric, approved numeric, official numeric,
  awaiting_review numeric, returned numeric, not_submitted numeric,
  submitted_reports bigint, approved_reports bigint, returned_reports bigint, draft_reports bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (select is_manager()) then
    raise exception 'Only a manager can view the performance report';
  end if;
  perform assert_report_period(p_from, p_to);

  return query
  with x as (
    select e.amount, e.source, r.status as report_status
    from expenses e
    left join expense_reports r on r.id = e.report_id
    where e.status = 'active' and e.incurred_on between p_from and p_to
  ),
  rep as (
    select status from expense_reports where period_start <= p_to and period_end >= p_from
  )
  select
    coalesce(sum(amount) filter (where source = 'manager'), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where source = 'operator' and report_status = 'approved'), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where source = 'manager' or report_status = 'approved'), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where source = 'operator' and report_status = 'submitted'), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where source = 'operator' and report_status = 'returned'), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where source = 'operator' and (report_status is null or report_status = 'draft')), 0)::numeric(14, 2),
    (select count(*) from rep where status = 'submitted'),
    (select count(*) from rep where status = 'approved'),
    (select count(*) from rep where status = 'returned'),
    (select count(*) from rep where status = 'draft')
  from x;
end;
$$;

revoke execute on function expense_review_summary(date, date) from public, anon;
grant execute on function expense_review_summary(date, date) to authenticated;

-- A report's totals by category (for the report page), for its operator
-- or a manager.
create function expense_report_categories(p_report_id uuid)
returns table (category_id uuid, name text, profit_group text, total numeric, expense_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.profit_group, coalesce(sum(x.amount), 0)::numeric(14, 2), count(x.id)
  from expenses x
  join expense_categories c on c.id = x.category_id
  join expense_reports r on r.id = x.report_id
  where x.report_id = p_report_id and x.status = 'active'
    and (is_manager() or r.operator_id = auth.uid())
  group by c.id
  order by array_position(array['salary', 'rent', 'fuel', 'subscription', 'other'], c.profit_group), c.name;
$$;

revoke execute on function expense_report_categories(uuid) from public, anon;
grant execute on function expense_report_categories(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 6. Reads for the pages
-- ════════════════════════════════════════════════════════════════════════
-- The signed-in operator's own expenses in a period, by category and
-- review state (unreported / draft / submitted / approved / returned).
create function my_expense_totals(p_from date, p_to date)
returns table (category_id uuid, name text, state text, total numeric, expense_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, coalesce(r.status, 'unreported'), sum(x.amount)::numeric(14, 2), count(*)
  from expenses x
  join expense_categories c on c.id = x.category_id
  left join expense_reports r on r.id = x.report_id
  where x.source = 'operator' and x.created_by = auth.uid() and x.status = 'active'
    and x.incurred_on between p_from and p_to
  group by c.id, coalesce(r.status, 'unreported')
  order by c.name;
$$;

revoke execute on function my_expense_totals(date, date) from public, anon;
grant execute on function my_expense_totals(date, date) to authenticated;

-- Reports with their live totals: the caller's own (operator), or — for a
-- manager — every operator's overlapping a period, optionally one status.
create function expense_report_list(p_from date default null, p_to date default null, p_status text default null)
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
    count(x.id) filter (where x.status = 'active' and x.receipt_path is not null),
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

revoke execute on function expense_report_list(date, date, text) from public, anon;
grant execute on function expense_report_list(date, date, text) to authenticated;

-- A report's history with who did each step (an operator can't read
-- managers' profiles). Its operator or a manager.
create function expense_report_history(p_report_id uuid)
returns table (action text, actor_name text, note text, total numeric, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.action, p.full_name, e.note, e.total, e.created_at
  from expense_report_events e
  join expense_reports r on r.id = e.report_id
  left join profiles p on p.id = e.actor_id
  where e.report_id = p_report_id and (is_manager() or r.operator_id = auth.uid())
  order by e.created_at, e.id;
$$;

revoke execute on function expense_report_history(uuid) from public, anon;
grant execute on function expense_report_history(uuid) to authenticated;
