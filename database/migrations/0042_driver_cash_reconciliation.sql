-- Driver cash reconciliation: what each driver collected, handed over to
-- ParcelLink, and still owes.
--
-- What already existed: one cod_transactions row per cash-bearing shipment
-- (0007, split into product_amount + delivery_fee_amount in 0022), created
-- 'expected' when a driver is assigned, moved to 'collected' by the driver
-- (complete_delivery() for postpaid goods, or the driver's COD page), then
-- 'reconciled' (cash checked in by staff) and 'remitted' (paid out) one row
-- at a time. That records per-shipment states, but not money: there was no
-- record of an amount at the moment of collection, and no record of the
-- cash a driver actually hands over, which is rarely one shipment at a time.
--
-- Added here:
--
-- 1. Verified collections. cod_transactions.collected_amount and
--    collected_by are written by a trigger at the moment a row becomes
--    'collected', from the row's own amount (what the driver was shown and
--    confirmed), and can never be changed afterwards — by anyone. Rows
--    collected before this migration keep collected_amount null: their
--    amount was never confirmed as collected cash, so the dashboard shows
--    them as "unverified" and leaves them out of the balance rather than
--    inventing figures.
--
-- 2. Remittances. driver_cash_remittances is one row per cash handover from
--    a driver: amount (AED), method, reference, the day it was received,
--    and status pending → confirmed | rejected. Only confirmed remittances
--    count. Rows are written only by the functions below (RLS on, no write
--    policies) and can't be deleted or edited except for that one decision.
--    A retry of the same request returns the original row
--    (recorded_by + client_request_id is unique).
--
--      record_driver_remittance()  operators and managers. An operator's
--                                  remittance waits for a manager; a
--                                  manager's is confirmed at once.
--      decide_driver_remittance()  managers: confirm or reject (a rejection
--                                  needs a reason).
--
--    A remittance can't exceed what the driver owes: amount ≤ outstanding −
--    other pending remittances, checked under a per-driver lock, and checked
--    again on confirmation.
--
-- 3. Settlement. Confirming a remittance marks the driver's oldest verified
--    'collected' rows 'reconciled' (with remittance_id), as far as the
--    confirmed cash covers them in full. Verified rows can no longer be
--    reconciled one by one without a remittance — that would settle the
--    same cash twice. Unverified (pre-migration) rows keep the old
--    per-shipment Reconcile button.
--
-- Definitions (driver_cash_summary()):
--   expected     amount on 'expected' rows: cash the driver is due to
--                collect on shipments not yet delivered. Not money held.
--   collected    sum of collected_amount (verified collections).
--   remitted     sum of confirmed remittances.
--   outstanding  collected − remitted: cash the driver holds for ParcelLink.
--   pending      sum of pending remittances (not deducted).
--   unverified   amount on pre-migration rows still 'collected', unsettled.
-- Outstanding is always the current balance. A date range filters the
-- period columns only (collected by collected_at, remitted by the day it
-- was received, shipments by when the cash record was created); it never
-- changes the balance.

-- ── 1. Remittances ───────────────────────────────────────────────────────
create table driver_cash_remittances (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles (id),
  amount numeric(10, 2) not null check (amount > 0 and amount <= 1000000),
  currency text not null default 'AED' check (currency = 'AED'),
  method text not null check (method in ('cash', 'bank_transfer', 'other')),
  reference text check (reference is null or length(reference) <= 100),
  notes text check (notes is null or length(notes) <= 500),
  received_on date not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  recorded_by uuid not null references profiles (id),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_cash_remittances_decision_check check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status = 'confirmed' and decided_by is not null and decided_at is not null)
    or (status = 'rejected' and decided_by is not null and decided_at is not null and length(btrim(coalesce(decision_note, ''))) > 0)
  ),
  constraint driver_cash_remittances_request_unique unique (recorded_by, client_request_id)
);

create index driver_cash_remittances_driver_idx on driver_cash_remittances (driver_id, status, received_on desc);
create index driver_cash_remittances_status_idx on driver_cash_remittances (status, created_at desc);

create trigger driver_cash_remittances_set_updated_at
  before update on driver_cash_remittances
  for each row execute function set_updated_at();

-- A financial record: never deleted, and only pending → decided. Applies to
-- every role, the service role included.
create function enforce_driver_remittance_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Remittances can''t be deleted';
  end if;
  if old.status <> 'pending'
    or new.driver_id is distinct from old.driver_id
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.method is distinct from old.method
    or new.reference is distinct from old.reference
    or new.notes is distinct from old.notes
    or new.received_on is distinct from old.received_on
    or new.recorded_by is distinct from old.recorded_by
    or new.client_request_id is distinct from old.client_request_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'A remittance can only be confirmed or rejected once';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_driver_remittance_immutability() from public, anon, authenticated;

create trigger driver_cash_remittances_immutable
  before update or delete on driver_cash_remittances
  for each row execute function enforce_driver_remittance_immutability();

alter table driver_cash_remittances enable row level security;

-- Staff only. Drivers keep seeing their own COD rows (0007); nobody else
-- sees remittances.
create policy driver_cash_remittances_select on driver_cash_remittances
  for select using ((select is_staff()));
-- No insert/update/delete policies: only the functions below write it.

-- ── 2. Verified collections ──────────────────────────────────────────────
alter table cod_transactions
  add column collected_amount numeric(10, 2) check (collected_amount is null or collected_amount >= 0),
  add column collected_by uuid references profiles (id),
  add column remittance_id uuid references driver_cash_remittances (id);

create index cod_transactions_driver_collected_idx on cod_transactions (driver_id, collected_at) where collected_amount is not null;
create index cod_transactions_remittance_idx on cod_transactions (remittance_id) where remittance_id is not null;

-- SECURITY INVOKER: auth.uid() is the session's (the driver confirming).
create function record_cod_collection()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'expected' and new.status = 'collected' then
    -- What was collected, by whom and when come from the record and the
    -- session, never from the request: the amount the driver confirmed,
    -- and the moment it was confirmed (which orders settlement).
    new.collected_amount := old.amount;
    new.collected_by := auth.uid();
    new.collected_at := clock_timestamp();
  else
    -- Written once, at collection; untouchable afterwards. Older rows
    -- stay null (unverified).
    if new.collected_amount is distinct from old.collected_amount
      or new.collected_by is distinct from old.collected_by
    then
      raise exception 'A recorded collection can''t be changed';
    end if;
  end if;

  if new.remittance_id is distinct from old.remittance_id and old.remittance_id is not null then
    raise exception 'A settled collection can''t be moved to another remittance';
  end if;

  -- Verified cash is settled by a remittance, never row by row.
  if old.status = 'collected' and new.status = 'reconciled'
    and old.collected_amount is not null and new.remittance_id is null
  then
    raise exception 'Record a driver remittance to settle this cash';
  end if;

  return new;
end;
$$;

revoke execute on function record_cod_collection() from public, anon, authenticated;

create trigger cod_transactions_record_collection
  before update on cod_transactions
  for each row execute function record_cod_collection();

-- ── 3. Balances ──────────────────────────────────────────────────────────
-- The driver's current position; internal (the functions below lock the
-- driver first, so the numbers can't move between check and write).
create function driver_cash_position(p_driver_id uuid)
returns table (collected numeric, remitted numeric, pending numeric, outstanding numeric)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select coalesce(sum(collected_amount), 0)::numeric(12, 2) as collected
    from cod_transactions where driver_id = p_driver_id and collected_amount is not null
  ),
  r as (
    select
      coalesce(sum(amount) filter (where status = 'confirmed'), 0)::numeric(12, 2) as remitted,
      coalesce(sum(amount) filter (where status = 'pending'), 0)::numeric(12, 2) as pending
    from driver_cash_remittances where driver_id = p_driver_id
  )
  select c.collected, r.remitted, r.pending, (c.collected - r.remitted)::numeric(12, 2)
  from c, r;
$$;

revoke execute on function driver_cash_position(uuid) from public, anon, authenticated;

-- Marks the driver's oldest verified, unsettled collections reconciled, as
-- far as confirmed cash not yet applied to a collection covers them in full.
create function apply_driver_remittances(p_driver_id uuid, p_remittance_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit numeric(12, 2);
  v_row record;
begin
  select
    (select coalesce(sum(amount), 0) from driver_cash_remittances where driver_id = p_driver_id and status = 'confirmed')
    - (select coalesce(sum(collected_amount), 0) from cod_transactions where driver_id = p_driver_id and remittance_id is not null)
  into v_credit;

  for v_row in
    select id, collected_amount from cod_transactions
    where driver_id = p_driver_id and status = 'collected' and collected_amount is not null and remittance_id is null
    order by collected_at, id
    for update
  loop
    exit when v_row.collected_amount > v_credit;
    update cod_transactions
    set status = 'reconciled', reconciled_by = auth.uid(), reconciled_at = now(), remittance_id = p_remittance_id
    where id = v_row.id;
    v_credit := v_credit - v_row.collected_amount;
  end loop;
end;
$$;

revoke execute on function apply_driver_remittances(uuid, uuid) from public, anon, authenticated;

-- Caller must be an active operator or manager; returns their role.
create function require_cash_staff()
returns user_role
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  select role into v_role from profiles
  where id = auth.uid() and active and deleted_at is null and role in ('operator', 'manager');
  if v_role is null then
    raise exception 'Only operators and managers can manage driver cash';
  end if;
  return v_role;
end;
$$;

revoke execute on function require_cash_staff() from public, anon, authenticated;

-- ── 4. Recording and deciding ────────────────────────────────────────────
create function record_driver_remittance(
  p_driver_id uuid,
  p_amount numeric,
  p_method text,
  p_received_on date,
  p_reference text,
  p_notes text,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := require_cash_staff();
  v_actor uuid := auth.uid();
  v_existing driver_cash_remittances%rowtype;
  v_position record;
  v_available numeric(12, 2);
  v_id uuid;
begin
  if p_client_request_id is null then
    raise exception 'Missing request id';
  end if;

  -- Serialise everything that changes this driver's balance.
  perform pg_advisory_xact_lock(hashtextextended('driver_cash:' || p_driver_id::text, 0));

  -- A retry of the same submission returns the original remittance.
  select * into v_existing from driver_cash_remittances
  where recorded_by = v_actor and client_request_id = p_client_request_id;
  if found then
    if v_existing.driver_id <> p_driver_id or v_existing.amount <> p_amount then
      raise exception 'This request was already used for a different remittance';
    end if;
    return v_existing.id;
  end if;

  if not exists (select 1 from profiles where id = p_driver_id and role = 'driver') then
    raise exception 'Driver not found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_amount <> round(p_amount, 2) then
    raise exception 'Use at most two decimal places';
  end if;
  if p_method is null or p_method not in ('cash', 'bank_transfer', 'other') then
    raise exception 'Choose how the money was received';
  end if;
  if p_received_on is null or p_received_on > (now() at time zone 'Asia/Dubai')::date then
    raise exception 'The date received can''t be in the future';
  end if;

  select * into v_position from driver_cash_position(p_driver_id);
  v_available := v_position.outstanding - v_position.pending;
  if p_amount > v_available then
    raise exception 'This is more than the driver owes: AED % outstanding, AED % already awaiting confirmation',
      v_position.outstanding, v_position.pending;
  end if;

  insert into driver_cash_remittances (
    driver_id, amount, method, received_on, reference, notes, recorded_by, client_request_id,
    status, decided_by, decided_at
  ) values (
    p_driver_id, p_amount, p_method, p_received_on,
    nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
    v_actor, p_client_request_id,
    case when v_role = 'manager' then 'confirmed' else 'pending' end,
    case when v_role = 'manager' then v_actor end,
    case when v_role = 'manager' then now() end
  )
  returning id into v_id;

  if v_role = 'manager' then
    perform apply_driver_remittances(p_driver_id, v_id);
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (
    v_actor, 'driver_cash.remittance_recorded', 'driver_cash_remittance', v_id,
    jsonb_build_object(
      'driverId', p_driver_id, 'amount', p_amount, 'currency', 'AED', 'method', p_method,
      'receivedOn', p_received_on, 'status', case when v_role = 'manager' then 'confirmed' else 'pending' end
    )
  );

  return v_id;
end;
$$;

revoke execute on function record_driver_remittance(uuid, numeric, text, date, text, text, uuid) from public, anon;
grant execute on function record_driver_remittance(uuid, numeric, text, date, text, text, uuid) to authenticated;

create function decide_driver_remittance(p_remittance_id uuid, p_decision text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := require_cash_staff();
  v_actor uuid := auth.uid();
  v_remittance driver_cash_remittances%rowtype;
  v_position record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_role <> 'manager' then
    raise exception 'Only a manager can confirm or reject a remittance';
  end if;
  if p_decision is null or p_decision not in ('confirmed', 'rejected') then
    raise exception 'Choose confirm or reject';
  end if;
  if p_decision = 'rejected' and v_note is null then
    raise exception 'Give a reason for rejecting this remittance';
  end if;
  if length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;

  select * into v_remittance from driver_cash_remittances where id = p_remittance_id;
  if not found then
    raise exception 'Remittance not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('driver_cash:' || v_remittance.driver_id::text, 0));
  select * into v_remittance from driver_cash_remittances where id = p_remittance_id for update;

  if v_remittance.status <> 'pending' then
    -- A repeated click with the same decision is a no-op.
    if v_remittance.status = p_decision then
      return v_remittance.status;
    end if;
    raise exception 'This remittance was already %', v_remittance.status;
  end if;

  if p_decision = 'confirmed' then
    select * into v_position from driver_cash_position(v_remittance.driver_id);
    if v_remittance.amount > v_position.outstanding then
      raise exception 'This is more than the driver now owes (AED %)', v_position.outstanding;
    end if;
  end if;

  update driver_cash_remittances
  set status = p_decision, decided_by = v_actor, decided_at = now(), decision_note = v_note
  where id = p_remittance_id;

  if p_decision = 'confirmed' then
    perform apply_driver_remittances(v_remittance.driver_id, p_remittance_id);
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_actor, 'driver_cash.remittance_' || p_decision, 'driver_cash_remittance', p_remittance_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', p_decision, 'note', v_note, 'amount', v_remittance.amount, 'driverId', v_remittance.driver_id)
  );

  return p_decision;
end;
$$;

revoke execute on function decide_driver_remittance(uuid, text, text) from public, anon;
grant execute on function decide_driver_remittance(uuid, text, text) to authenticated;

-- ── 5. Dashboard ─────────────────────────────────────────────────────────
-- One row per driver with any cash record or remittance, computed in the
-- database (paged by PostgREST .range()). SECURITY INVOKER plus an explicit
-- staff check: anyone else gets nothing.
create function driver_cash_summary(
  p_from date default null,
  p_to date default null,
  p_query text default null
)
returns table (
  driver_id uuid,
  driver_name text,
  driver_phone text,
  shipments bigint,
  expected numeric,
  collected numeric,
  collected_in_period numeric,
  unverified numeric,
  remitted numeric,
  remitted_in_period numeric,
  pending numeric,
  outstanding numeric,
  last_remittance_on date
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      case when p_from is null then null else p_from::timestamp at time zone 'Asia/Dubai' end as from_ts,
      case when p_to is null then null else (p_to + 1)::timestamp at time zone 'Asia/Dubai' end as to_ts,
      case
        when nullif(btrim(left(p_query, 100)), '') is null then null
        else '%' || replace(replace(replace(lower(btrim(left(p_query, 100))), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pattern
  ),
  cod as (
    select
      c.driver_id,
      count(*) filter (where (b.from_ts is null or c.created_at >= b.from_ts) and (b.to_ts is null or c.created_at < b.to_ts)) as shipments,
      coalesce(sum(c.amount) filter (where c.status = 'expected'), 0) as expected,
      coalesce(sum(c.collected_amount), 0) as collected,
      coalesce(sum(c.collected_amount) filter (
        where (b.from_ts is null or c.collected_at >= b.from_ts) and (b.to_ts is null or c.collected_at < b.to_ts)
      ), 0) as collected_in_period,
      coalesce(sum(c.amount) filter (where c.status = 'collected' and c.collected_amount is null), 0) as unverified
    from cod_transactions c cross join bounds b
    group by c.driver_id
  ),
  rem as (
    select
      r.driver_id,
      coalesce(sum(r.amount) filter (where r.status = 'confirmed'), 0) as remitted,
      coalesce(sum(r.amount) filter (
        where r.status = 'confirmed' and (p_from is null or r.received_on >= p_from) and (p_to is null or r.received_on <= p_to)
      ), 0) as remitted_in_period,
      coalesce(sum(r.amount) filter (where r.status = 'pending'), 0) as pending,
      max(r.received_on) filter (where r.status = 'confirmed') as last_remittance_on
    from driver_cash_remittances r
    group by r.driver_id
  )
  select
    p.id,
    p.full_name,
    p.phone,
    coalesce(cod.shipments, 0),
    coalesce(cod.expected, 0)::numeric(12, 2),
    coalesce(cod.collected, 0)::numeric(12, 2),
    coalesce(cod.collected_in_period, 0)::numeric(12, 2),
    coalesce(cod.unverified, 0)::numeric(12, 2),
    coalesce(rem.remitted, 0)::numeric(12, 2),
    coalesce(rem.remitted_in_period, 0)::numeric(12, 2),
    coalesce(rem.pending, 0)::numeric(12, 2),
    (coalesce(cod.collected, 0) - coalesce(rem.remitted, 0))::numeric(12, 2),
    rem.last_remittance_on
  from profiles p
  cross join bounds b
  left join cod on cod.driver_id = p.id
  left join rem on rem.driver_id = p.id
  where (select is_staff())
    and p.role = 'driver'
    and (cod.driver_id is not null or rem.driver_id is not null)
    and (b.pattern is null or lower(p.full_name) like b.pattern or lower(p.phone) like b.pattern)
  order by (coalesce(cod.collected, 0) - coalesce(rem.remitted, 0)) desc, p.full_name, p.id;
$$;

revoke execute on function driver_cash_summary(date, date, text) from public, anon;
grant execute on function driver_cash_summary(date, date, text) to authenticated;

-- The summary cards: the same rows, summed over every driver that matches
-- (not just the page on screen).
create function driver_cash_totals(
  p_from date default null,
  p_to date default null,
  p_query text default null
)
returns table (
  drivers bigint,
  expected numeric,
  collected numeric,
  collected_in_period numeric,
  unverified numeric,
  remitted numeric,
  remitted_in_period numeric,
  pending numeric,
  outstanding numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*),
    coalesce(sum(s.expected), 0),
    coalesce(sum(s.collected), 0),
    coalesce(sum(s.collected_in_period), 0),
    coalesce(sum(s.unverified), 0),
    coalesce(sum(s.remitted), 0),
    coalesce(sum(s.remitted_in_period), 0),
    coalesce(sum(s.pending), 0),
    coalesce(sum(s.outstanding), 0)
  from driver_cash_summary(p_from, p_to, p_query) s;
$$;

revoke execute on function driver_cash_totals(date, date, text) from public, anon;
grant execute on function driver_cash_totals(date, date, text) to authenticated;
