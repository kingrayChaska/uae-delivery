-- Cash only, and weekly cash remittance: driver → operator → manager.
--
-- ── 1. Card payments off ─────────────────────────────────────────────────
-- There has never been a live card gateway (lib/payments is a stub that
-- throws; no webhook, checkout page or payment link exists), but card was
-- still offered at booking and left shipments waiting at 'pending_payment'
-- for a payment that could never be taken. Now:
--   payment_settings      one row; card_payments_enabled defaults to false.
--                         No client can write it — reactivation is a
--                         deliberate SQL change by an administrator, made
--                         together with CARD_PAYMENTS_ENABLED=true in the app
--                         and a real provider (see the root README).
--   shipments_enforce_cash_only
--                         a client session can't create a card shipment, or
--                         switch one to card, while that flag is off. Staff
--                         included. Trusted code (service role, SECURITY
--                         DEFINER) is left to its own checks.
--   switch_shipment_to_cash()
--                         a card shipment still waiting for its payment can
--                         be moved to cash by its customer or by staff: it
--                         becomes cash and 'confirmed' (ready for dispatch).
--                         Its payment stays 'pending' — the fee is collected
--                         in cash later, never assumed paid. Nothing else
--                         changes: historical payments rows, paid shipments,
--                         COD amounts and invoices are untouched.
--
-- ── 2. Driver → operator ─────────────────────────────────────────────────
-- 0042 already holds the money: verified collections (cod_transactions with
-- collected_amount, split into product_amount = goods/COD and the rest =
-- the sender's cash delivery fee) and driver_cash_remittances (pending →
-- confirmed counts; reserved while pending). Until now staff recorded each
-- handover and a manager confirmed it. Added:
--   - the driver submits a remittance (source 'driver'), split into COD and
--     delivery fees, for at most what they hold in each, less what is
--     already pending: submit_driver_remittance().
--   - an operator (or a manager) who physically counts the cash confirms it:
--     confirm_driver_remittance(). Counting less than submitted is a
--     discrepancy, never an edit: the submission is closed 'disputed' with
--     both amounts and the reason, and the cash actually counted is recorded
--     as its own confirmed remittance linked to it (discrepancy_of). The
--     difference stays on the driver's balance. Counting more is refused.
--   - dispute_driver_remittance(): nothing counted; the amount stays
--     outstanding; the driver submits again once it's sorted out.
--   - The confirming person becomes the custodian (received_by): an
--     operator's confirmed receipts are cash that operator now owes the
--     manager. A manager's are cash already with the manager.
--   - Every remittance gets a number (DRM-YYYY-NNNNNN), older ones included.
--   - Drivers can read their own remittances.
-- Staff-recorded remittances (0042) keep working exactly as before; they
-- carry no COD/fee split ("unclassified") and never enter an operator's
-- balance (a manager confirms them).
--
-- ── 3. Operator → manager ────────────────────────────────────────────────
--   operator_cash_remittances   same shape and rules one level up:
--     submit_operator_remittance() (operators: at most what they received
--     from drivers in each category, less confirmed and pending), confirm_
--     operator_remittance() / dispute_operator_remittance() (managers). The
--     same cash is counted once per level: an operator's balance is only
--     driver cash THEY confirmed, minus what a manager confirmed from them.
--
-- ── Balances ─────────────────────────────────────────────────────────────
--   driver outstanding    = verified collections − confirmed remittances
--                           (0042; unchanged). Per category: collected COD
--                           (or fees) − confirmed COD (or fees).
--   driver available      = per category: outstanding − pending.
--   operator outstanding  = confirmed driver receipts held by the operator −
--                           remittances a manager confirmed.
-- Pending amounts are reserved, never deducted. Weeks are Monday–Sunday in
-- Asia/Dubai (the app's existing business timezone). A new week starts a new
-- summary; the balance carries over — nothing is reset or deleted.
--
-- Notifications (in-app, from these functions): a submission tells the
-- people who confirm it; a confirmation, discrepancy or dispute tells the
-- submitter. A repeated request returns the first result and notifies no one.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Card payments
-- ════════════════════════════════════════════════════════════════════════
create table payment_settings (
  id boolean primary key default true check (id),
  card_payments_enabled boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

insert into payment_settings (card_payments_enabled, note)
values (false, 'Card payments off: cash only (migration 0048).');

create trigger payment_settings_set_updated_at
  before update on payment_settings
  for each row execute function set_updated_at();

alter table payment_settings enable row level security;
create policy payment_settings_select on payment_settings for select using (true);
-- No write policies, and no write grants: only an administrator (SQL).
revoke insert, update, delete on payment_settings from anon, authenticated;

create function card_payments_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select card_payments_enabled from payment_settings where id), false);
$$;

revoke execute on function card_payments_enabled() from public, anon;
grant execute on function card_payments_enabled() to authenticated;

create function enforce_shipment_cash_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
    and new.payment_method = 'card'
    and (tg_op = 'INSERT' or old.payment_method is distinct from 'card')
    and not card_payments_enabled()
  then
    raise exception 'Card payments are turned off. Choose cash.';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_shipment_cash_only() from public, anon, authenticated;

create trigger shipments_enforce_cash_only
  before insert or update of payment_method on shipments
  for each row execute function enforce_shipment_cash_only();

create function switch_shipment_to_cash(p_shipment_id uuid)
returns shipment_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_ship shipments%rowtype;
begin
  if v_actor is null or not exists (select 1 from profiles where id = v_actor and active and deleted_at is null) then
    raise exception 'Shipment not found';
  end if;

  select * into v_ship from shipments where id = p_shipment_id for update;
  -- Only the customer who booked it, or staff; anyone else learns nothing.
  if not found or not (v_ship.customer_id = v_actor or is_staff()) then
    raise exception 'Shipment not found';
  end if;

  -- Already cash (a repeated click): nothing to do.
  if v_ship.payment_method = 'cod' then
    return v_ship.status;
  end if;

  if v_ship.payment_status <> 'pending'
    or exists (select 1 from payments where shipment_id = v_ship.id and status in ('paid', 'refunded'))
  then
    raise exception 'This shipment already has a card payment, so it can''t switch to cash';
  end if;
  if v_ship.status <> 'pending_payment' then
    raise exception 'Only a shipment still waiting for its card payment can switch to cash';
  end if;

  perform set_config('app.switch_to_cash', 'on', true);
  update shipments
  set payment_method = 'cod', status = 'confirmed'
  where id = v_ship.id;
  perform set_config('app.switch_to_cash', '', true);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_actor, 'shipment.switched_to_cash', 'shipment', v_ship.id,
    jsonb_build_object('paymentMethod', 'card', 'status', v_ship.status, 'paymentStatus', v_ship.payment_status),
    jsonb_build_object('paymentMethod', 'cod', 'status', 'confirmed', 'paymentStatus', 'pending')
  );

  return 'confirmed';
end;
$$;

revoke execute on function switch_shipment_to_cash(uuid) from public, anon;
grant execute on function switch_shipment_to_cash(uuid) to authenticated;

-- As 0046, plus one branch: switching to cash isn't "Payment successful".
create or replace function notify_shipment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by_driver boolean := old.driver_id is not null and old.driver_id = auth.uid();
  v_correction boolean := nullif(current_setting('app.status_correction_reason', true), '') is not null;
  v_by_staff boolean := nullif(current_setting('app.staff_cancellation', true), '') is not null;
  v_to_cash boolean := nullif(current_setting('app.switch_to_cash', true), '') is not null;
begin
  if new.status is distinct from old.status and not v_correction then
    if new.status = 'confirmed' and old.status = 'pending_payment' and v_to_cash then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.switched_to_cash', 'Paying in cash', new.tracking_number || ' will be paid in cash and is waiting for a driver.');
      perform notify_operators(
        'shipment.ready_for_dispatch', 'New shipment ready for dispatch',
        new.tracking_number || ' is confirmed and awaiting a driver.'
      );

    elsif new.status = 'confirmed' and old.status = 'pending_payment' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'payment.success', 'Payment successful', 'Payment for ' || new.tracking_number || ' was received.');
      perform notify_operators(
        'shipment.ready_for_dispatch', 'New shipment ready for dispatch',
        new.tracking_number || ' is confirmed and awaiting a driver.'
      );

    elsif new.status = 'confirmed' and old.status = 'assigned' then
      perform notify_operators(
        'shipment.driver_declined', 'Driver declined an assignment',
        new.tracking_number || ' needs a new driver.'
      );

    elsif new.status = 'arrived_pickup' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.driver_arriving', 'Driver arriving', 'Your driver has arrived for pickup of ' || new.tracking_number || '.');

    elsif new.status = 'picked_up' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.picked_up', 'Parcel picked up', new.tracking_number || ' has been picked up.');

    elsif new.status = 'in_transit' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.in_transit', 'Parcel in transit', new.tracking_number || ' is on its way.');

    elsif new.status = 'delivered' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.delivered', 'Delivery completed', new.tracking_number || ' has been delivered.');

    elsif new.status = 'delivery_failed' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.delivery_failed', 'Delivery failed', 'A delivery attempt for ' || new.tracking_number || ' failed.');
      perform notify_operators(
        'shipment.delivery_failed', 'Delivery failed — needs attention',
        new.tracking_number || ' failed delivery and needs action.'
      );

    elsif new.status = 'cancelled' and v_by_staff then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.cancelled_by_operations', 'Shipment cancelled', new.tracking_number || ' was cancelled by ParcelLink operations.');
      if old.driver_id is not null then
        insert into notifications (profile_id, type, title, body)
        values (old.driver_id, 'shipment.cancelled_by_operations', 'Delivery cancelled', new.tracking_number || ' was cancelled by operations and is no longer on your deliveries.');
      end if;

    elsif new.status = 'cancelled' and v_by_driver then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.cancelled_by_driver', 'Shipment cancelled', new.tracking_number || ' was cancelled by the driver.');
      perform notify_operators(
        'shipment.cancelled_by_driver', 'Driver cancelled a shipment',
        new.tracking_number || ' was cancelled by the driver before pickup.'
      );

    elsif new.status = 'cancelled' and old.driver_id is not null then
      insert into notifications (profile_id, type, title, body)
      values (old.driver_id, 'shipment.cancelled', 'Delivery cancelled', new.tracking_number || ' was cancelled by the customer.');

    elsif new.status = 'returned' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.returned', 'Shipment returned', new.tracking_number || ' is being returned to the sender.');
      if v_by_driver then
        perform notify_operators(
          'shipment.returned', 'Driver returned a shipment',
          new.tracking_number || ' was not delivered and is being returned to the sender.'
        );
      end if;
    end if;
  end if;

  if new.driver_id is distinct from old.driver_id and new.driver_id is not null then
    insert into notifications (profile_id, type, title, body)
    values (new.driver_id, 'shipment.assigned', 'New delivery assigned', 'You''ve been assigned ' || new.tracking_number || '.');

    if old.driver_id is not null then
      insert into notifications (profile_id, type, title, body)
      values (old.driver_id, 'shipment.unassigned', 'Delivery reassigned', new.tracking_number || ' has been reassigned to another driver.');
    end if;
  end if;

  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Shared helpers
-- ════════════════════════════════════════════════════════════════════════
-- Monday of the Asia/Dubai week containing a moment.
create function dubai_week_start(p_at timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select date_trunc('week', p_at at time zone 'Asia/Dubai')::date;
$$;

grant execute on function dubai_week_start(timestamptz) to authenticated;

-- A money amount a person typed: present, ≥ 0, whole fils.
create function assert_cash_amount(p_amount numeric)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_amount is null or p_amount < 0 or p_amount > 10000000 or p_amount = 'NaN'::numeric then
    raise exception 'Enter an amount of AED 0 or more';
  end if;
  if p_amount <> round(p_amount, 2) then
    raise exception 'Use at most two decimal places';
  end if;
end;
$$;

revoke execute on function assert_cash_amount(numeric) from public, anon, authenticated;

-- In-app notice to every active profile with a role.
create function notify_role(p_role user_role, p_type text, p_title text, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (profile_id, type, title, body)
  select id, p_type, p_title, p_body from profiles
  where role = p_role and active and deleted_at is null;
$$;

revoke execute on function notify_role(user_role, text, text, text) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Driver remittances: numbers, split, custody, disputes
-- ════════════════════════════════════════════════════════════════════════
create sequence driver_remittance_number_seq;

alter table driver_cash_remittances
  add column source text not null default 'staff' check (source in ('staff', 'driver')),
  add column remittance_number text,
  add column cod_amount numeric(10, 2) check (cod_amount is null or cod_amount >= 0),
  add column fee_amount numeric(10, 2) check (fee_amount is null or fee_amount >= 0),
  add column period_start date,
  add column received_by uuid references profiles (id),
  add column received_by_role user_role,
  add column discrepancy_of uuid references driver_cash_remittances (id);

-- Number the existing remittances, oldest first. Only this new column is
-- written; the trigger that freezes decided rows is paused for it alone.
alter table driver_cash_remittances disable trigger driver_cash_remittances_immutable;
update driver_cash_remittances r
set remittance_number = n.number,
    period_start = dubai_week_start(r.created_at)
from (
  select id,
    'DRM-' || to_char(created_at at time zone 'Asia/Dubai', 'YYYY') || '-'
      || lpad(nextval('driver_remittance_number_seq')::text, 6, '0') as number
  from (select id, created_at from driver_cash_remittances order by created_at, id) ordered
) n
where n.id = r.id;
alter table driver_cash_remittances enable trigger driver_cash_remittances_immutable;

alter table driver_cash_remittances
  alter column remittance_number set not null,
  alter column period_start set not null,
  add constraint driver_cash_remittances_number_unique unique (remittance_number),
  drop constraint driver_cash_remittances_status_check,
  add constraint driver_cash_remittances_status_check check (status in ('pending', 'confirmed', 'rejected', 'disputed')),
  drop constraint driver_cash_remittances_decision_check,
  add constraint driver_cash_remittances_decision_check check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status = 'confirmed' and decided_by is not null and decided_at is not null)
    or (status in ('rejected', 'disputed') and decided_by is not null and decided_at is not null
        and length(btrim(coalesce(decision_note, ''))) > 0)
  ),
  -- Both halves or neither (staff-recorded remittances are unclassified).
  add constraint driver_cash_remittances_split_check check (
    (cod_amount is null and fee_amount is null)
    or (cod_amount is not null and fee_amount is not null and cod_amount + fee_amount = amount)
  ),
  add constraint driver_cash_remittances_driver_split check (source = 'staff' or cod_amount is not null),
  add constraint driver_cash_remittances_custody check (
    (received_by is null) = (received_by_role is null)
    and (received_by_role is null or received_by_role in ('operator', 'manager'))
    and (source = 'staff' or status <> 'confirmed' or received_by is not null)
  );

-- One counted-cash record per disputed submission.
create unique index driver_cash_remittances_discrepancy_unique on driver_cash_remittances (discrepancy_of)
  where discrepancy_of is not null;
create index driver_cash_remittances_custody_idx on driver_cash_remittances (received_by, status)
  where received_by is not null;
create index driver_cash_remittances_queue_idx on driver_cash_remittances (source, status, created_at desc);

create function assign_driver_remittance_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.remittance_number := 'DRM-' || to_char(now() at time zone 'Asia/Dubai', 'YYYY') || '-'
    || lpad(nextval('driver_remittance_number_seq')::text, 6, '0');
  new.period_start := coalesce(new.period_start, dubai_week_start(now()));
  return new;
end;
$$;

revoke execute on function assign_driver_remittance_number() from public, anon, authenticated;

create trigger driver_cash_remittances_number
  before insert on driver_cash_remittances
  for each row execute function assign_driver_remittance_number();

-- As 0042: never deleted; only pending → decided; everything recorded at
-- submission is frozen. The custodian is written with the decision.
create or replace function enforce_driver_remittance_immutability()
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
    or new.source is distinct from old.source
    or new.remittance_number is distinct from old.remittance_number
    or new.cod_amount is distinct from old.cod_amount
    or new.fee_amount is distinct from old.fee_amount
    or new.period_start is distinct from old.period_start
    or new.discrepancy_of is distinct from old.discrepancy_of
  then
    raise exception 'A remittance can only be confirmed or rejected once';
  end if;
  return new;
end;
$$;

-- Drivers see their own remittances; staff see all (0042).
create policy driver_cash_remittances_select_own on driver_cash_remittances
  for select using (driver_id = (select auth.uid()));

-- Caller must be an active driver; returns their id.
create function require_active_driver()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'driver' and active and deleted_at is null
  ) then
    raise exception 'Only drivers can submit a cash remittance';
  end if;
  return auth.uid();
end;
$$;

revoke execute on function require_active_driver() from public, anon, authenticated;

-- The driver's position by category, now (internal: callers lock first).
create function driver_cash_breakdown(p_driver_id uuid)
returns table (
  collected_cod numeric, collected_fee numeric,
  confirmed_cod numeric, confirmed_fee numeric, confirmed_unclassified numeric,
  pending_cod numeric, pending_fee numeric, pending_unclassified numeric,
  outstanding numeric, available numeric, available_cod numeric, available_fee numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select
      coalesce(sum(product_amount), 0)::numeric(12, 2) as cod,
      coalesce(sum(collected_amount - product_amount), 0)::numeric(12, 2) as fee
    from cod_transactions
    where driver_id = p_driver_id and collected_amount is not null
  ),
  r as (
    select
      coalesce(sum(cod_amount) filter (where status = 'confirmed'), 0)::numeric(12, 2) as conf_cod,
      coalesce(sum(fee_amount) filter (where status = 'confirmed'), 0)::numeric(12, 2) as conf_fee,
      coalesce(sum(amount) filter (where status = 'confirmed' and cod_amount is null), 0)::numeric(12, 2) as conf_none,
      coalesce(sum(cod_amount) filter (where status = 'pending'), 0)::numeric(12, 2) as pend_cod,
      coalesce(sum(fee_amount) filter (where status = 'pending'), 0)::numeric(12, 2) as pend_fee,
      coalesce(sum(amount) filter (where status = 'pending' and cod_amount is null), 0)::numeric(12, 2) as pend_none
    from driver_cash_remittances
    where driver_id = p_driver_id
  )
  select
    c.cod, c.fee, r.conf_cod, r.conf_fee, r.conf_none, r.pend_cod, r.pend_fee, r.pend_none,
    (c.cod + c.fee - r.conf_cod - r.conf_fee - r.conf_none)::numeric(12, 2),
    greatest(c.cod + c.fee - r.conf_cod - r.conf_fee - r.conf_none - r.pend_cod - r.pend_fee - r.pend_none, 0)::numeric(12, 2),
    greatest(c.cod - r.conf_cod - r.pend_cod, 0)::numeric(12, 2),
    greatest(c.fee - r.conf_fee - r.pend_fee, 0)::numeric(12, 2)
  from c, r;
$$;

revoke execute on function driver_cash_breakdown(uuid) from public, anon, authenticated;

create function submit_driver_remittance(
  p_cod_amount numeric,
  p_fee_amount numeric,
  p_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid := require_active_driver();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_existing driver_cash_remittances%rowtype;
  v_pos record;
  v_row driver_cash_remittances%rowtype;
  v_name text;
begin
  if p_request_id is null then
    raise exception 'Missing request id';
  end if;
  perform assert_cash_amount(p_cod_amount);
  perform assert_cash_amount(p_fee_amount);
  if p_cod_amount + p_fee_amount <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;

  -- Serialise everything that changes this driver's balance (as 0042).
  perform pg_advisory_xact_lock(hashtextextended('driver_cash:' || v_driver::text, 0));

  select * into v_existing from driver_cash_remittances
  where recorded_by = v_driver and client_request_id = p_request_id;
  if found then
    if v_existing.cod_amount is distinct from p_cod_amount or v_existing.fee_amount is distinct from p_fee_amount then
      raise exception 'This request was already used for a different remittance';
    end if;
    return jsonb_build_object('id', v_existing.id, 'number', v_existing.remittance_number,
      'status', v_existing.status, 'amount', v_existing.amount);
  end if;

  select * into v_pos from driver_cash_breakdown(v_driver);
  if p_cod_amount > v_pos.available_cod then
    raise exception 'This is more COD than you hold: AED % available', v_pos.available_cod;
  end if;
  if p_fee_amount > v_pos.available_fee then
    raise exception 'This is more in delivery fees than you hold: AED % available', v_pos.available_fee;
  end if;
  if p_cod_amount + p_fee_amount > v_pos.available then
    raise exception 'This is more than you hold: AED % available', v_pos.available;
  end if;

  insert into driver_cash_remittances (
    driver_id, amount, cod_amount, fee_amount, method, received_on, notes,
    recorded_by, client_request_id, source, status
  ) values (
    v_driver, p_cod_amount + p_fee_amount, p_cod_amount, p_fee_amount, 'cash',
    (now() at time zone 'Asia/Dubai')::date, v_note, v_driver, p_request_id, 'driver', 'pending'
  )
  returning * into v_row;

  select coalesce(full_name, 'A driver') into v_name from profiles where id = v_driver;
  perform notify_role('operator', 'cash.driver_remittance_submitted', 'Driver cash to confirm',
    v_name || ' submitted ' || v_row.remittance_number || ' (AED ' || to_char(v_row.amount, 'FM999999990.00')
      || ') — confirm it when you receive the cash.');

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (v_driver, 'driver_cash.remittance_submitted', 'driver_cash_remittance', v_row.id,
    jsonb_build_object('number', v_row.remittance_number, 'amount', v_row.amount,
      'codAmount', v_row.cod_amount, 'feeAmount', v_row.fee_amount, 'status', 'pending'));

  return jsonb_build_object('id', v_row.id, 'number', v_row.remittance_number, 'status', v_row.status, 'amount', v_row.amount);
end;
$$;

revoke execute on function submit_driver_remittance(numeric, numeric, text, uuid) from public, anon;
grant execute on function submit_driver_remittance(numeric, numeric, text, uuid) to authenticated;

create function confirm_driver_remittance(
  p_remittance_id uuid,
  p_received_cod numeric,
  p_received_fee numeric,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := require_cash_staff();
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_rem driver_cash_remittances%rowtype;
  v_counted driver_cash_remittances%rowtype;
  v_pos record;
  v_received numeric(12, 2);
  v_name text;
begin
  perform assert_cash_amount(p_received_cod);
  perform assert_cash_amount(p_received_fee);
  if length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;

  select * into v_rem from driver_cash_remittances where id = p_remittance_id;
  if not found then
    raise exception 'Remittance not found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('driver_cash:' || v_rem.driver_id::text, 0));
  select * into v_rem from driver_cash_remittances where id = p_remittance_id for update;

  if v_rem.source <> 'driver' then
    raise exception 'A manager decides remittances recorded by staff';
  end if;

  -- A repeated click: report what was decided, change nothing.
  if v_rem.status = 'confirmed' then
    return jsonb_build_object('status', 'confirmed', 'number', v_rem.remittance_number, 'confirmedAmount', v_rem.amount);
  end if;
  if v_rem.status = 'disputed' then
    select * into v_counted from driver_cash_remittances where discrepancy_of = v_rem.id;
    if found then
      return jsonb_build_object('status', 'discrepancy', 'number', v_rem.remittance_number,
        'confirmedAmount', v_counted.amount, 'countedNumber', v_counted.remittance_number);
    end if;
    raise exception 'This remittance was already disputed';
  end if;
  if v_rem.status <> 'pending' then
    raise exception 'This remittance was already %', v_rem.status;
  end if;

  if p_received_cod > v_rem.cod_amount or p_received_fee > v_rem.fee_amount then
    raise exception 'You can''t confirm more than the driver submitted';
  end if;
  v_received := p_received_cod + p_received_fee;

  select * into v_pos from driver_cash_breakdown(v_rem.driver_id);
  if v_received > v_pos.outstanding then
    raise exception 'This is more than the driver now owes (AED %)', v_pos.outstanding;
  end if;

  select coalesce(full_name, 'Staff') into v_name from profiles where id = v_actor;

  if p_received_cod = v_rem.cod_amount and p_received_fee = v_rem.fee_amount then
    update driver_cash_remittances
    set status = 'confirmed', decided_by = v_actor, decided_at = now(), decision_note = v_note,
        received_by = v_actor, received_by_role = v_role
    where id = v_rem.id;
    perform apply_driver_remittances(v_rem.driver_id, v_rem.id);

    insert into notifications (profile_id, type, title, body)
    values (v_rem.driver_id, 'cash.driver_remittance_confirmed', 'Remittance confirmed',
      v_rem.remittance_number || ' (AED ' || to_char(v_rem.amount, 'FM999999990.00') || ') was confirmed by ' || v_name || '.');
    insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_actor, 'driver_cash.remittance_confirmed', 'driver_cash_remittance', v_rem.id,
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', 'confirmed', 'amount', v_rem.amount, 'receivedBy', v_actor, 'role', v_role));

    select * into v_pos from driver_cash_breakdown(v_rem.driver_id);
    return jsonb_build_object('status', 'confirmed', 'number', v_rem.remittance_number,
      'confirmedAmount', v_rem.amount, 'driverOutstanding', v_pos.outstanding);
  end if;

  -- A discrepancy: the submission stays as it was, closed with both amounts
  -- and the reason; what was counted is recorded as its own remittance.
  if v_note is null or length(v_note) < 5 then
    raise exception 'Explain the difference (at least 5 characters)';
  end if;

  update driver_cash_remittances
  set status = 'disputed', decided_by = v_actor, decided_at = now(),
      decision_note = left(format('Counted AED %s of AED %s: %s',
        to_char(v_received, 'FM999999990.00'), to_char(v_rem.amount, 'FM999999990.00'), v_note), 500)
  where id = v_rem.id;

  if v_received > 0 then
    insert into driver_cash_remittances (
      driver_id, amount, cod_amount, fee_amount, method, received_on, notes, recorded_by, client_request_id,
      source, status, decided_by, decided_at, decision_note, received_by, received_by_role, discrepancy_of, period_start
    ) values (
      v_rem.driver_id, v_received, p_received_cod, p_received_fee, 'cash', (now() at time zone 'Asia/Dubai')::date,
      'Cash counted for ' || v_rem.remittance_number, v_actor, gen_random_uuid(),
      'driver', 'confirmed', v_actor, now(), v_note, v_actor, v_role, v_rem.id, v_rem.period_start
    )
    returning * into v_counted;
    perform apply_driver_remittances(v_rem.driver_id, v_counted.id);
  end if;

  insert into notifications (profile_id, type, title, body)
  values (v_rem.driver_id, 'cash.driver_remittance_discrepancy', 'Remittance amount differs',
    v_rem.remittance_number || ': ' || v_name || ' counted AED ' || to_char(v_received, 'FM999999990.00')
      || ' of AED ' || to_char(v_rem.amount, 'FM999999990.00') || '. The difference stays on your balance.');
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_actor, 'driver_cash.remittance_discrepancy', 'driver_cash_remittance', v_rem.id,
    jsonb_build_object('status', 'pending', 'amount', v_rem.amount, 'codAmount', v_rem.cod_amount, 'feeAmount', v_rem.fee_amount),
    jsonb_build_object('status', 'disputed', 'counted', v_received, 'countedCod', p_received_cod, 'countedFee', p_received_fee,
      'reason', v_note, 'countedId', v_counted.id, 'receivedBy', v_actor, 'role', v_role));

  select * into v_pos from driver_cash_breakdown(v_rem.driver_id);
  return jsonb_build_object('status', 'discrepancy', 'number', v_rem.remittance_number,
    'confirmedAmount', v_received, 'countedNumber', v_counted.remittance_number, 'driverOutstanding', v_pos.outstanding);
end;
$$;

revoke execute on function confirm_driver_remittance(uuid, numeric, numeric, text) from public, anon;
grant execute on function confirm_driver_remittance(uuid, numeric, numeric, text) to authenticated;

create function dispute_driver_remittance(p_remittance_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := require_cash_staff();
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_rem driver_cash_remittances%rowtype;
  v_name text;
begin
  if length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Give a reason for the dispute (5 to 500 characters)';
  end if;

  select * into v_rem from driver_cash_remittances where id = p_remittance_id;
  if not found then
    raise exception 'Remittance not found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('driver_cash:' || v_rem.driver_id::text, 0));
  select * into v_rem from driver_cash_remittances where id = p_remittance_id for update;

  if v_rem.source <> 'driver' then
    raise exception 'A manager decides remittances recorded by staff';
  end if;
  if v_rem.status = 'disputed' then
    return 'disputed';
  end if;
  if v_rem.status <> 'pending' then
    raise exception 'This remittance was already %', v_rem.status;
  end if;

  update driver_cash_remittances
  set status = 'disputed', decided_by = v_actor, decided_at = now(), decision_note = v_reason
  where id = v_rem.id;

  select coalesce(full_name, 'Staff') into v_name from profiles where id = v_actor;
  insert into notifications (profile_id, type, title, body)
  values (v_rem.driver_id, 'cash.driver_remittance_disputed', 'Remittance disputed',
    v_rem.remittance_number || ' was disputed by ' || v_name || '. The amount stays on your balance.');
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_actor, 'driver_cash.remittance_disputed', 'driver_cash_remittance', v_rem.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'disputed', 'reason', v_reason, 'amount', v_rem.amount, 'role', v_role));
  return 'disputed';
end;
$$;

revoke execute on function dispute_driver_remittance(uuid, text) from public, anon;
grant execute on function dispute_driver_remittance(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Operator remittances to the manager
-- ════════════════════════════════════════════════════════════════════════
create sequence operator_remittance_number_seq;

create table operator_cash_remittances (
  id uuid primary key default gen_random_uuid(),
  remittance_number text not null unique,
  operator_id uuid not null references profiles (id),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  cod_amount numeric(12, 2) not null check (cod_amount >= 0),
  fee_amount numeric(12, 2) not null check (fee_amount >= 0),
  currency text not null default 'AED' check (currency = 'AED'),
  period_start date not null,
  notes text check (notes is null or length(notes) <= 500),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disputed')),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  -- The disputed submission this counted cash belongs to.
  discrepancy_of uuid references operator_cash_remittances (id),
  recorded_by uuid not null references profiles (id),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_cash_remittances_split check (cod_amount + fee_amount = amount),
  constraint operator_cash_remittances_decision check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status = 'confirmed' and decided_by is not null and decided_at is not null)
    or (status = 'disputed' and decided_by is not null and decided_at is not null
        and length(btrim(coalesce(decision_note, ''))) > 0)
  ),
  constraint operator_cash_remittances_request_unique unique (recorded_by, client_request_id)
);

create unique index operator_cash_remittances_discrepancy_unique on operator_cash_remittances (discrepancy_of)
  where discrepancy_of is not null;
create index operator_cash_remittances_operator_idx on operator_cash_remittances (operator_id, status, created_at desc);
create index operator_cash_remittances_status_idx on operator_cash_remittances (status, created_at desc);

create trigger operator_cash_remittances_set_updated_at
  before update on operator_cash_remittances
  for each row execute function set_updated_at();

create function assign_operator_remittance_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.remittance_number := 'OPR-' || to_char(now() at time zone 'Asia/Dubai', 'YYYY') || '-'
    || lpad(nextval('operator_remittance_number_seq')::text, 6, '0');
  return new;
end;
$$;

revoke execute on function assign_operator_remittance_number() from public, anon, authenticated;

create trigger operator_cash_remittances_number
  before insert on operator_cash_remittances
  for each row execute function assign_operator_remittance_number();

create function enforce_operator_remittance_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Remittances can''t be deleted';
  end if;
  if old.status <> 'pending'
    or (to_jsonb(new) - array['status', 'decided_by', 'decided_at', 'decision_note', 'updated_at'])
       is distinct from (to_jsonb(old) - array['status', 'decided_by', 'decided_at', 'decision_note', 'updated_at'])
  then
    raise exception 'A remittance can only be confirmed or rejected once';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_operator_remittance_immutability() from public, anon, authenticated;

create trigger operator_cash_remittances_immutable
  before update or delete on operator_cash_remittances
  for each row execute function enforce_operator_remittance_immutability();

alter table operator_cash_remittances enable row level security;
-- The operator's own; managers see every operator's.
create policy operator_cash_remittances_select on operator_cash_remittances
  for select using (operator_id = (select auth.uid()) or (select is_manager()));
-- No write policies or grants: only the functions below write it.
revoke insert, update, delete on operator_cash_remittances from anon, authenticated;

-- The operator's position by category, now (internal: callers lock first).
create function operator_cash_breakdown(p_operator_id uuid)
returns table (
  received_cod numeric, received_fee numeric,
  confirmed_cod numeric, confirmed_fee numeric,
  pending_cod numeric, pending_fee numeric,
  outstanding numeric, available_cod numeric, available_fee numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select
      coalesce(sum(cod_amount), 0)::numeric(12, 2) as cod,
      coalesce(sum(fee_amount), 0)::numeric(12, 2) as fee
    from driver_cash_remittances
    where received_by = p_operator_id and received_by_role = 'operator' and status = 'confirmed'
  ),
  o as (
    select
      coalesce(sum(cod_amount) filter (where status = 'confirmed'), 0)::numeric(12, 2) as conf_cod,
      coalesce(sum(fee_amount) filter (where status = 'confirmed'), 0)::numeric(12, 2) as conf_fee,
      coalesce(sum(cod_amount) filter (where status = 'pending'), 0)::numeric(12, 2) as pend_cod,
      coalesce(sum(fee_amount) filter (where status = 'pending'), 0)::numeric(12, 2) as pend_fee
    from operator_cash_remittances
    where operator_id = p_operator_id
  )
  select
    d.cod, d.fee, o.conf_cod, o.conf_fee, o.pend_cod, o.pend_fee,
    (d.cod + d.fee - o.conf_cod - o.conf_fee)::numeric(12, 2),
    greatest(d.cod - o.conf_cod - o.pend_cod, 0)::numeric(12, 2),
    greatest(d.fee - o.conf_fee - o.pend_fee, 0)::numeric(12, 2)
  from d, o;
$$;

revoke execute on function operator_cash_breakdown(uuid) from public, anon, authenticated;

create function submit_operator_remittance(
  p_cod_amount numeric,
  p_fee_amount numeric,
  p_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_existing operator_cash_remittances%rowtype;
  v_pos record;
  v_row operator_cash_remittances%rowtype;
  v_name text;
begin
  if v_actor is null or not exists (
    select 1 from profiles where id = v_actor and role = 'operator' and active and deleted_at is null
  ) then
    raise exception 'Only operators can submit a remittance to the manager';
  end if;
  if p_request_id is null then
    raise exception 'Missing request id';
  end if;
  perform assert_cash_amount(p_cod_amount);
  perform assert_cash_amount(p_fee_amount);
  if p_cod_amount + p_fee_amount <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('operator_cash:' || v_actor::text, 0));

  select * into v_existing from operator_cash_remittances
  where recorded_by = v_actor and client_request_id = p_request_id;
  if found then
    if v_existing.cod_amount <> p_cod_amount or v_existing.fee_amount <> p_fee_amount then
      raise exception 'This request was already used for a different remittance';
    end if;
    return jsonb_build_object('id', v_existing.id, 'number', v_existing.remittance_number,
      'status', v_existing.status, 'amount', v_existing.amount);
  end if;

  select * into v_pos from operator_cash_breakdown(v_actor);
  if p_cod_amount > v_pos.available_cod then
    raise exception 'This is more COD than you hold: AED % available', v_pos.available_cod;
  end if;
  if p_fee_amount > v_pos.available_fee then
    raise exception 'This is more in delivery fees than you hold: AED % available', v_pos.available_fee;
  end if;

  insert into operator_cash_remittances (
    operator_id, amount, cod_amount, fee_amount, period_start, notes, recorded_by, client_request_id
  ) values (
    v_actor, p_cod_amount + p_fee_amount, p_cod_amount, p_fee_amount, dubai_week_start(now()), v_note, v_actor, p_request_id
  )
  returning * into v_row;

  select coalesce(full_name, 'Staff') into v_name from profiles where id = v_actor;
  perform notify_role('manager', 'cash.operator_remittance_submitted', 'Operator cash to confirm',
    v_name || ' submitted ' || v_row.remittance_number || ' (AED ' || to_char(v_row.amount, 'FM999999990.00')
      || ') — confirm it when you receive the cash.');

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (v_actor, 'operator_cash.remittance_submitted', 'operator_cash_remittance', v_row.id,
    jsonb_build_object('number', v_row.remittance_number, 'amount', v_row.amount,
      'codAmount', v_row.cod_amount, 'feeAmount', v_row.fee_amount, 'status', 'pending'));

  return jsonb_build_object('id', v_row.id, 'number', v_row.remittance_number, 'status', v_row.status, 'amount', v_row.amount);
end;
$$;

revoke execute on function submit_operator_remittance(numeric, numeric, text, uuid) from public, anon;
grant execute on function submit_operator_remittance(numeric, numeric, text, uuid) to authenticated;

-- Caller must be an active manager.
create function require_cash_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'manager' and active and deleted_at is null
  ) then
    raise exception 'Only a manager can confirm an operator''s remittance';
  end if;
  return auth.uid();
end;
$$;

revoke execute on function require_cash_manager() from public, anon, authenticated;

create function confirm_operator_remittance(
  p_remittance_id uuid,
  p_received_cod numeric,
  p_received_fee numeric,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := require_cash_manager();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_rem operator_cash_remittances%rowtype;
  v_counted operator_cash_remittances%rowtype;
  v_pos record;
  v_received numeric(12, 2);
  v_name text;
begin
  perform assert_cash_amount(p_received_cod);
  perform assert_cash_amount(p_received_fee);
  if length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;

  select * into v_rem from operator_cash_remittances where id = p_remittance_id;
  if not found then
    raise exception 'Remittance not found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('operator_cash:' || v_rem.operator_id::text, 0));
  select * into v_rem from operator_cash_remittances where id = p_remittance_id for update;

  if v_rem.status = 'confirmed' then
    return jsonb_build_object('status', 'confirmed', 'number', v_rem.remittance_number, 'confirmedAmount', v_rem.amount);
  end if;
  if v_rem.status = 'disputed' then
    select * into v_counted from operator_cash_remittances where discrepancy_of = v_rem.id;
    if found then
      return jsonb_build_object('status', 'discrepancy', 'number', v_rem.remittance_number,
        'confirmedAmount', v_counted.amount, 'countedNumber', v_counted.remittance_number);
    end if;
    raise exception 'This remittance was already disputed';
  end if;

  if p_received_cod > v_rem.cod_amount or p_received_fee > v_rem.fee_amount then
    raise exception 'You can''t confirm more than the operator submitted';
  end if;
  v_received := p_received_cod + p_received_fee;

  select * into v_pos from operator_cash_breakdown(v_rem.operator_id);
  if v_received > v_pos.outstanding then
    raise exception 'This is more than the operator now holds (AED %)', v_pos.outstanding;
  end if;

  select coalesce(full_name, 'Staff') into v_name from profiles where id = v_actor;

  if p_received_cod = v_rem.cod_amount and p_received_fee = v_rem.fee_amount then
    update operator_cash_remittances
    set status = 'confirmed', decided_by = v_actor, decided_at = now(), decision_note = v_note
    where id = v_rem.id;

    insert into notifications (profile_id, type, title, body)
    values (v_rem.operator_id, 'cash.operator_remittance_confirmed', 'Remittance confirmed',
      v_rem.remittance_number || ' (AED ' || to_char(v_rem.amount, 'FM999999990.00') || ') was confirmed by ' || v_name || '.');
    insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_actor, 'operator_cash.remittance_confirmed', 'operator_cash_remittance', v_rem.id,
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'confirmed', 'amount', v_rem.amount));

    select * into v_pos from operator_cash_breakdown(v_rem.operator_id);
    return jsonb_build_object('status', 'confirmed', 'number', v_rem.remittance_number,
      'confirmedAmount', v_rem.amount, 'operatorOutstanding', v_pos.outstanding);
  end if;

  if v_note is null or length(v_note) < 5 then
    raise exception 'Explain the difference (at least 5 characters)';
  end if;

  update operator_cash_remittances
  set status = 'disputed', decided_by = v_actor, decided_at = now(),
      decision_note = left(format('Counted AED %s of AED %s: %s',
        to_char(v_received, 'FM999999990.00'), to_char(v_rem.amount, 'FM999999990.00'), v_note), 500)
  where id = v_rem.id;

  if v_received > 0 then
    insert into operator_cash_remittances (
      operator_id, amount, cod_amount, fee_amount, period_start, notes, status, decided_by, decided_at,
      decision_note, discrepancy_of, recorded_by, client_request_id
    ) values (
      v_rem.operator_id, v_received, p_received_cod, p_received_fee, v_rem.period_start,
      'Cash counted for ' || v_rem.remittance_number, 'confirmed', v_actor, now(), v_note, v_rem.id,
      v_actor, gen_random_uuid()
    )
    returning * into v_counted;
  end if;

  insert into notifications (profile_id, type, title, body)
  values (v_rem.operator_id, 'cash.operator_remittance_discrepancy', 'Remittance amount differs',
    v_rem.remittance_number || ': ' || v_name || ' counted AED ' || to_char(v_received, 'FM999999990.00')
      || ' of AED ' || to_char(v_rem.amount, 'FM999999990.00') || '. The difference stays on your balance.');
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_actor, 'operator_cash.remittance_discrepancy', 'operator_cash_remittance', v_rem.id,
    jsonb_build_object('status', 'pending', 'amount', v_rem.amount),
    jsonb_build_object('status', 'disputed', 'counted', v_received, 'countedCod', p_received_cod,
      'countedFee', p_received_fee, 'reason', v_note, 'countedId', v_counted.id));

  select * into v_pos from operator_cash_breakdown(v_rem.operator_id);
  return jsonb_build_object('status', 'discrepancy', 'number', v_rem.remittance_number,
    'confirmedAmount', v_received, 'countedNumber', v_counted.remittance_number, 'operatorOutstanding', v_pos.outstanding);
end;
$$;

revoke execute on function confirm_operator_remittance(uuid, numeric, numeric, text) from public, anon;
grant execute on function confirm_operator_remittance(uuid, numeric, numeric, text) to authenticated;

create function dispute_operator_remittance(p_remittance_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := require_cash_manager();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_rem operator_cash_remittances%rowtype;
  v_name text;
begin
  if length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Give a reason for the dispute (5 to 500 characters)';
  end if;

  select * into v_rem from operator_cash_remittances where id = p_remittance_id;
  if not found then
    raise exception 'Remittance not found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('operator_cash:' || v_rem.operator_id::text, 0));
  select * into v_rem from operator_cash_remittances where id = p_remittance_id for update;

  if v_rem.status = 'disputed' then
    return 'disputed';
  end if;
  if v_rem.status <> 'pending' then
    raise exception 'This remittance was already %', v_rem.status;
  end if;

  update operator_cash_remittances
  set status = 'disputed', decided_by = v_actor, decided_at = now(), decision_note = v_reason
  where id = v_rem.id;

  select coalesce(full_name, 'Staff') into v_name from profiles where id = v_actor;
  insert into notifications (profile_id, type, title, body)
  values (v_rem.operator_id, 'cash.operator_remittance_disputed', 'Remittance disputed',
    v_rem.remittance_number || ' was disputed by ' || v_name || '. The amount stays on your balance.');
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_actor, 'operator_cash.remittance_disputed', 'operator_cash_remittance', v_rem.id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'disputed', 'reason', v_reason, 'amount', v_rem.amount));
  return 'disputed';
end;
$$;

revoke execute on function dispute_operator_remittance(uuid, text) from public, anon;
grant execute on function dispute_operator_remittance(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Dashboards (read)
-- ════════════════════════════════════════════════════════════════════════
-- The driver's cards: this week, and the position now. The driver
-- themselves or staff; anyone else gets null.
create function driver_cash_overview(p_driver_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver uuid := coalesce(p_driver_id, auth.uid());
  v_week date := dubai_week_start(now());
  v_from timestamptz := v_week::timestamp at time zone 'Asia/Dubai';
  v_pos record;
  v_week_cod numeric(12, 2);
  v_week_fee numeric(12, 2);
  v_week_confirmed numeric(12, 2);
  v_opening numeric(12, 2);
  v_counts record;
begin
  if v_driver is null or not (v_driver = auth.uid() or is_staff()) then
    return null;
  end if;
  if not exists (select 1 from profiles where id = v_driver and role = 'driver') then
    return null;
  end if;

  select * into v_pos from driver_cash_breakdown(v_driver);

  select coalesce(sum(product_amount), 0), coalesce(sum(collected_amount - product_amount), 0)
  into v_week_cod, v_week_fee
  from cod_transactions
  where driver_id = v_driver and collected_amount is not null and collected_at >= v_from;

  select coalesce(sum(amount), 0) into v_week_confirmed
  from driver_cash_remittances where driver_id = v_driver and status = 'confirmed' and decided_at >= v_from;

  -- Carried into this week: everything collected before it, less what had
  -- been confirmed before it.
  v_opening := v_pos.outstanding - (v_week_cod + v_week_fee) + v_week_confirmed;

  select
    count(*) filter (where status = 'pending') as pending_count,
    count(*) filter (where status = 'disputed' and not exists (
      select 1 from driver_cash_remittances c where c.discrepancy_of = driver_cash_remittances.id
    )) as disputed_count,
    coalesce(sum(amount) filter (where status = 'disputed'), 0) as disputed_amount
  into v_counts
  from driver_cash_remittances where driver_id = v_driver;

  return jsonb_build_object(
    'weekStart', v_week,
    'weekEnd', v_week + 6,
    'week', jsonb_build_object('collectedCod', v_week_cod, 'collectedFee', v_week_fee, 'confirmed', v_week_confirmed),
    'openingOutstanding', v_opening,
    'collectedCod', v_pos.collected_cod,
    'collectedFee', v_pos.collected_fee,
    'confirmedCod', v_pos.confirmed_cod,
    'confirmedFee', v_pos.confirmed_fee,
    'confirmedUnclassified', v_pos.confirmed_unclassified,
    'pendingCod', v_pos.pending_cod,
    'pendingFee', v_pos.pending_fee,
    'pendingUnclassified', v_pos.pending_unclassified,
    'pendingCount', v_counts.pending_count,
    'disputedCount', v_counts.disputed_count,
    'disputedAmount', v_counts.disputed_amount,
    'outstanding', v_pos.outstanding,
    'outstandingCod', v_pos.collected_cod - v_pos.confirmed_cod,
    'outstandingFee', v_pos.collected_fee - v_pos.confirmed_fee,
    'available', v_pos.available,
    'availableCod', least(v_pos.available_cod, v_pos.available),
    'availableFee', least(v_pos.available_fee, v_pos.available),
    'expected', coalesce((select sum(amount) from cod_transactions where driver_id = v_driver and status = 'expected'), 0),
    'unverified', coalesce((select sum(amount) from cod_transactions
      where driver_id = v_driver and status = 'collected' and collected_amount is null), 0)
  );
end;
$$;

revoke execute on function driver_cash_overview(uuid) from public, anon;
grant execute on function driver_cash_overview(uuid) to authenticated;

-- Week by week, newest first: opening, collected (COD / fees), confirmed,
-- closing. Opening is what was still outstanding when the week began.
create function driver_cash_weeks(p_driver_id uuid default null, p_weeks integer default 8)
returns table (
  week_start date, opening numeric, collected_cod numeric, collected_fee numeric, confirmed numeric, closing numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with who as (
    select coalesce(p_driver_id, auth.uid()) as driver_id
  ),
  allowed as (
    select w.driver_id from who w
    where w.driver_id is not null and (w.driver_id = auth.uid() or is_staff())
  ),
  weeks as (
    select (dubai_week_start(now()) - (7 * g))::date as week_start
    from generate_series(0, greatest(least(coalesce(p_weeks, 8), 104), 1) - 1) g
  ),
  rows as (
    select
      w.week_start,
      (w.week_start::timestamp at time zone 'Asia/Dubai') as from_ts,
      ((w.week_start + 7)::timestamp at time zone 'Asia/Dubai') as to_ts
    from weeks w
  )
  select
    r.week_start,
    (coalesce((select sum(collected_amount) from cod_transactions c
      where c.driver_id = a.driver_id and c.collected_amount is not null and c.collected_at < r.from_ts), 0)
     - coalesce((select sum(amount) from driver_cash_remittances d
      where d.driver_id = a.driver_id and d.status = 'confirmed' and d.decided_at < r.from_ts), 0))::numeric(12, 2),
    coalesce((select sum(product_amount) from cod_transactions c
      where c.driver_id = a.driver_id and c.collected_amount is not null
        and c.collected_at >= r.from_ts and c.collected_at < r.to_ts), 0)::numeric(12, 2),
    coalesce((select sum(collected_amount - product_amount) from cod_transactions c
      where c.driver_id = a.driver_id and c.collected_amount is not null
        and c.collected_at >= r.from_ts and c.collected_at < r.to_ts), 0)::numeric(12, 2),
    coalesce((select sum(amount) from driver_cash_remittances d
      where d.driver_id = a.driver_id and d.status = 'confirmed'
        and d.decided_at >= r.from_ts and d.decided_at < r.to_ts), 0)::numeric(12, 2),
    (coalesce((select sum(collected_amount) from cod_transactions c
      where c.driver_id = a.driver_id and c.collected_amount is not null and c.collected_at < r.to_ts), 0)
     - coalesce((select sum(amount) from driver_cash_remittances d
      where d.driver_id = a.driver_id and d.status = 'confirmed' and d.decided_at < r.to_ts), 0))::numeric(12, 2)
  from rows r cross join allowed a
  order by r.week_start desc;
$$;

revoke execute on function driver_cash_weeks(uuid, integer) from public, anon;
grant execute on function driver_cash_weeks(uuid, integer) to authenticated;

-- The driver's remittances with the names of who received or decided them
-- (a driver can't read other profiles). Self or staff.
create function driver_remittance_history(p_driver_id uuid default null, p_status text default null)
returns table (
  id uuid, remittance_number text, source text, period_start date, amount numeric, cod_amount numeric,
  fee_amount numeric, status text, notes text, decision_note text, created_at timestamptz,
  decided_at timestamptz, decided_by_name text, received_by_role user_role, recorded_by_name text,
  discrepancy_of_number text, counted_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.remittance_number, r.source, r.period_start, r.amount, r.cod_amount, r.fee_amount, r.status,
    r.notes, r.decision_note, r.created_at, r.decided_at, dp.full_name, r.received_by_role, rp.full_name,
    o.remittance_number, c.amount
  from driver_cash_remittances r
  left join profiles dp on dp.id = r.decided_by
  left join profiles rp on rp.id = r.recorded_by
  left join driver_cash_remittances o on o.id = r.discrepancy_of
  left join driver_cash_remittances c on c.discrepancy_of = r.id
  where r.driver_id = coalesce(p_driver_id, auth.uid())
    and (coalesce(p_driver_id, auth.uid()) = auth.uid() or is_staff())
    and (p_status is null or r.status = p_status)
  order by r.created_at desc, r.id desc;
$$;

revoke execute on function driver_remittance_history(uuid, text) from public, anon;
grant execute on function driver_remittance_history(uuid, text) to authenticated;

-- The operators' queue: driver submissions, newest first. Staff only.
create function driver_remittance_queue(p_status text default 'pending')
returns table (
  id uuid, remittance_number text, driver_id uuid, driver_name text, driver_phone text, period_start date,
  amount numeric, cod_amount numeric, fee_amount numeric, status text, notes text, decision_note text,
  created_at timestamptz, decided_at timestamptz, decided_by_name text, counted_amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.id, r.remittance_number, r.driver_id, p.full_name, p.phone, r.period_start, r.amount, r.cod_amount,
    r.fee_amount, r.status, r.notes, r.decision_note, r.created_at, r.decided_at, dp.full_name, c.amount
  from driver_cash_remittances r
  join profiles p on p.id = r.driver_id
  left join profiles dp on dp.id = r.decided_by
  left join driver_cash_remittances c on c.discrepancy_of = r.id
  where (select is_staff())
    and r.source = 'driver'
    and r.discrepancy_of is null
    and (p_status is null or r.status = p_status)
  order by r.created_at desc, r.id desc;
$$;

revoke execute on function driver_remittance_queue(text) from public, anon;
grant execute on function driver_remittance_queue(text) to authenticated;

-- The operator's cards. The operator themselves or a manager.
create function operator_cash_overview(p_operator_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_op uuid := coalesce(p_operator_id, auth.uid());
  v_week date := dubai_week_start(now());
  v_from timestamptz := v_week::timestamp at time zone 'Asia/Dubai';
  v_pos record;
  v_week_received numeric(12, 2);
  v_week_confirmed numeric(12, 2);
  v_counts record;
begin
  if v_op is null or not (v_op = auth.uid() or is_manager()) then
    return null;
  end if;
  if not exists (select 1 from profiles where id = v_op and role = 'operator') then
    return null;
  end if;

  select * into v_pos from operator_cash_breakdown(v_op);

  select coalesce(sum(amount), 0) into v_week_received
  from driver_cash_remittances
  where received_by = v_op and received_by_role = 'operator' and status = 'confirmed' and decided_at >= v_from;

  select coalesce(sum(amount), 0) into v_week_confirmed
  from operator_cash_remittances where operator_id = v_op and status = 'confirmed' and decided_at >= v_from;

  select
    count(*) filter (where status = 'pending') as pending_count,
    count(*) filter (where status = 'disputed' and not exists (
      select 1 from operator_cash_remittances c where c.discrepancy_of = operator_cash_remittances.id
    )) as disputed_count,
    coalesce(sum(amount) filter (where status = 'disputed'), 0) as disputed_amount
  into v_counts
  from operator_cash_remittances where operator_id = v_op;

  return jsonb_build_object(
    'weekStart', v_week,
    'weekEnd', v_week + 6,
    'week', jsonb_build_object('received', v_week_received, 'confirmed', v_week_confirmed),
    'openingOutstanding', v_pos.outstanding - v_week_received + v_week_confirmed,
    'receivedCod', v_pos.received_cod,
    'receivedFee', v_pos.received_fee,
    'other', 0,
    'confirmedCod', v_pos.confirmed_cod,
    'confirmedFee', v_pos.confirmed_fee,
    'pendingCod', v_pos.pending_cod,
    'pendingFee', v_pos.pending_fee,
    'pendingCount', v_counts.pending_count,
    'disputedCount', v_counts.disputed_count,
    'disputedAmount', v_counts.disputed_amount,
    'outstanding', v_pos.outstanding,
    'outstandingCod', v_pos.received_cod - v_pos.confirmed_cod,
    'outstandingFee', v_pos.received_fee - v_pos.confirmed_fee,
    'availableCod', v_pos.available_cod,
    'availableFee', v_pos.available_fee,
    -- Driver submissions waiting for any operator to count them.
    'driverQueue', (select count(*) from driver_cash_remittances where source = 'driver' and status = 'pending')
  );
end;
$$;

revoke execute on function operator_cash_overview(uuid) from public, anon;
grant execute on function operator_cash_overview(uuid) to authenticated;

create function operator_cash_weeks(p_operator_id uuid default null, p_weeks integer default 8)
returns table (week_start date, opening numeric, received numeric, confirmed numeric, closing numeric)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select coalesce(p_operator_id, auth.uid()) as op
    where coalesce(p_operator_id, auth.uid()) is not null
      and (coalesce(p_operator_id, auth.uid()) = auth.uid() or is_manager())
  ),
  weeks as (
    select (dubai_week_start(now()) - (7 * g))::date as week_start
    from generate_series(0, greatest(least(coalesce(p_weeks, 8), 104), 1) - 1) g
  ),
  rows as (
    select w.week_start,
      (w.week_start::timestamp at time zone 'Asia/Dubai') as from_ts,
      ((w.week_start + 7)::timestamp at time zone 'Asia/Dubai') as to_ts
    from weeks w
  ),
  received as (
    select decided_at, amount from driver_cash_remittances d, allowed a
    where d.received_by = a.op and d.received_by_role = 'operator' and d.status = 'confirmed'
  ),
  remitted as (
    select decided_at, amount from operator_cash_remittances o, allowed a
    where o.operator_id = a.op and o.status = 'confirmed'
  )
  select
    r.week_start,
    (coalesce((select sum(amount) from received where decided_at < r.from_ts), 0)
      - coalesce((select sum(amount) from remitted where decided_at < r.from_ts), 0))::numeric(12, 2),
    coalesce((select sum(amount) from received where decided_at >= r.from_ts and decided_at < r.to_ts), 0)::numeric(12, 2),
    coalesce((select sum(amount) from remitted where decided_at >= r.from_ts and decided_at < r.to_ts), 0)::numeric(12, 2),
    (coalesce((select sum(amount) from received where decided_at < r.to_ts), 0)
      - coalesce((select sum(amount) from remitted where decided_at < r.to_ts), 0))::numeric(12, 2)
  from rows r
  where exists (select 1 from allowed)
  order by r.week_start desc;
$$;

revoke execute on function operator_cash_weeks(uuid, integer) from public, anon;
grant execute on function operator_cash_weeks(uuid, integer) to authenticated;

-- Operator remittances with names: the operator's own, or every operator's
-- for a manager.
create function operator_remittance_history(p_operator_id uuid default null, p_status text default null)
returns table (
  id uuid, remittance_number text, operator_id uuid, operator_name text, period_start date, amount numeric,
  cod_amount numeric, fee_amount numeric, status text, notes text, decision_note text, created_at timestamptz,
  decided_at timestamptz, decided_by_name text, discrepancy_of_number text, counted_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.remittance_number, r.operator_id, op.full_name, r.period_start, r.amount, r.cod_amount, r.fee_amount,
    r.status, r.notes, r.decision_note, r.created_at, r.decided_at, dp.full_name, o.remittance_number, c.amount
  from operator_cash_remittances r
  join profiles op on op.id = r.operator_id
  left join profiles dp on dp.id = r.decided_by
  left join operator_cash_remittances o on o.id = r.discrepancy_of
  left join operator_cash_remittances c on c.discrepancy_of = r.id
  where (
      (p_operator_id is null and (is_manager() or r.operator_id = auth.uid()))
      or (p_operator_id is not null and r.operator_id = p_operator_id and (p_operator_id = auth.uid() or is_manager()))
    )
    and (p_status is null or r.status = p_status)
  order by r.created_at desc, r.id desc;
$$;

revoke execute on function operator_remittance_history(uuid, text) from public, anon;
grant execute on function operator_remittance_history(uuid, text) to authenticated;

-- One row per operator for the manager: received from drivers, confirmed
-- to the manager, pending, outstanding. Managers only.
create function operator_cash_balances()
returns table (
  operator_id uuid, operator_name text, received numeric, remitted numeric, pending numeric,
  outstanding numeric, last_remitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.full_name,
    coalesce(d.received, 0)::numeric(12, 2),
    coalesce(o.remitted, 0)::numeric(12, 2),
    coalesce(o.pending, 0)::numeric(12, 2),
    (coalesce(d.received, 0) - coalesce(o.remitted, 0))::numeric(12, 2),
    o.last_at
  from profiles p
  left join (
    select received_by, sum(amount) as received from driver_cash_remittances
    where received_by_role = 'operator' and status = 'confirmed' group by received_by
  ) d on d.received_by = p.id
  left join (
    select operator_id,
      sum(amount) filter (where status = 'confirmed') as remitted,
      sum(amount) filter (where status = 'pending') as pending,
      max(decided_at) filter (where status = 'confirmed') as last_at
    from operator_cash_remittances group by operator_id
  ) o on o.operator_id = p.id
  where is_manager() and p.role = 'operator' and (d.received_by is not null or o.operator_id is not null)
  order by (coalesce(d.received, 0) - coalesce(o.remitted, 0)) desc, p.full_name;
$$;

revoke execute on function operator_cash_balances() from public, anon;
grant execute on function operator_cash_balances() to authenticated;

-- The manager's cards: cash with the manager, and cash still on its way.
create function manager_cash_totals()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not is_manager() then null else jsonb_build_object(
    'fromOperators', coalesce((select sum(amount) from operator_cash_remittances where status = 'confirmed'), 0),
    'fromOperatorsCod', coalesce((select sum(cod_amount) from operator_cash_remittances where status = 'confirmed'), 0),
    'fromOperatorsFee', coalesce((select sum(fee_amount) from operator_cash_remittances where status = 'confirmed'), 0),
    -- Confirmed by a manager directly from drivers (driver submissions a
    -- manager counted, and staff-recorded remittances of 0042).
    'directFromDrivers', coalesce((select sum(amount) from driver_cash_remittances
      where status = 'confirmed' and received_by_role is distinct from 'operator'), 0),
    'pendingFromOperators', coalesce((select sum(amount) from operator_cash_remittances where status = 'pending'), 0),
    'pendingCount', (select count(*) from operator_cash_remittances where status = 'pending'),
    'heldByOperators', coalesce((select sum(amount) from driver_cash_remittances
      where received_by_role = 'operator' and status = 'confirmed'), 0)
      - coalesce((select sum(amount) from operator_cash_remittances where status = 'confirmed'), 0),
    'heldByDrivers', coalesce((select sum(collected_amount) from cod_transactions where collected_amount is not null), 0)
      - coalesce((select sum(amount) from driver_cash_remittances where status = 'confirmed'), 0)
  ) end;
$$;

revoke execute on function manager_cash_totals() from public, anon;
grant execute on function manager_cash_totals() to authenticated;
