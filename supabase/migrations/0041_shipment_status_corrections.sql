-- Operators and managers correct a status a driver set by mistake (for
-- example "In transit" tapped before the parcel was picked up).
--
-- Status transitions are data (shipment_status_transitions, 0006) and the
-- trigger refuses anything not listed, for every caller. Corrections don't
-- loosen that table: they go through one SECURITY DEFINER function,
-- correct_shipment_status(), which is the only code allowed to step
-- outside the state machine, and only for the moves listed below.
--
--   Who        operators and managers (checked inside the function, not
--              trusted from the request). Re-opening a cancelled or returned
--              shipment is managers only.
--   What       from a driver-workflow status (assigned … arrived_destination,
--              delivery_failed) to another of assigned … arrived_destination.
--              The shipment must have a driver. 'delivered' is never a
--              source or a target: a delivery has proof of delivery and
--              usually a cash collection (0028/0037), and is only ever
--              reached through complete_delivery().
--   Reason     required, 5–500 characters.
--   Staleness  the caller passes the status they saw; if the shipment has
--              moved on since, nothing changes and the caller is told so.
--   History    shipment_status_history stays append-only: the correction
--              is a new row with event_type 'correction', the status it
--              replaced (previous_status) and the reason (note). The
--              mistaken row is never edited or deleted. Every row now
--              records previous_status.
--   Evidence   nothing is deleted: proof_of_delivery, shipment_outcome_proofs,
--              cancelled_reason and delivery_failed_reason are left as they
--              are. Re-opening a cancelled/returned shipment lets the COD
--              trigger (0022) recreate the expected collection record.
--   Notices    the status-change notifications (0039) are skipped for a
--              correction — a customer whose parcel was wrongly shown "in
--              transit" shouldn't then be told it was "picked up" — and the
--              assigned driver gets one 'shipment.status_corrected' notice.
--   Audit      one audit_logs row per correction, written in the same
--              transaction.
--
-- The bypass is a transaction-local setting the function sets around its
-- own UPDATE. The transition trigger honours it only when the UPDATE isn't
-- running as a client role (authenticated/anon) — i.e. inside this
-- SECURITY DEFINER function — so a client can't use it even if it could
-- set the value.

-- ── 1. History columns ───────────────────────────────────────────────────
alter table shipment_status_history
  add column previous_status shipment_status,
  add column event_type text not null default 'transition'
    check (event_type in ('transition', 'correction'));

create or replace function log_shipment_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.status_correction_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into shipment_status_history (shipment_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into shipment_status_history (shipment_id, status, previous_status, changed_by, event_type, note)
    values (
      new.id, new.status, old.status, auth.uid(),
      case when v_reason is null then 'transition' else 'correction' end,
      v_reason
    );
  end if;
  return new;
end;
$$;

-- ── 2. State machine bypass for corrections only ─────────────────────────
-- SECURITY INVOKER (as in 0006): current_user is the caller's role, so a
-- direct client update can never take the bypass.
create or replace function enforce_shipment_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if current_user not in ('authenticated', 'anon')
    and nullif(current_setting('app.status_correction_reason', true), '') is not null
  then
    return new;
  end if;

  if not exists (
    select 1 from shipment_status_transitions
    where from_status = old.status and to_status = new.status
  ) then
    raise exception 'Invalid shipment status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

-- ── 3. No status notifications for a correction ──────────────────────────
-- As 0039, with the status branch skipped while a correction is applied.
create or replace function notify_shipment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by_driver boolean := old.driver_id is not null and old.driver_id = auth.uid();
  v_correction boolean := nullif(current_setting('app.status_correction_reason', true), '') is not null;
begin
  if new.status is distinct from old.status and not v_correction then
    if new.status = 'confirmed' and old.status = 'pending_payment' then
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

-- ── 4. Public tracking history ───────────────────────────────────────────
-- As 0022, plus each row's event_type, so the tracking page can leave out
-- the steps a correction undid (lib/shipment/tracking-milestones.ts). Still
-- no notes, people or ids. The return type changes, so drop and recreate,
-- with the 0011 grants.
drop function get_shipment_tracking_history(text);

create function get_shipment_tracking_history(p_tracking_number text)
returns table (status shipment_status, created_at timestamptz, event_type text)
language sql
stable
security definer
set search_path = public
as $$
  select h.status, h.created_at, h.event_type
  from shipment_status_history h
  join shipments s on s.id = h.shipment_id
  where s.tracking_number = upper(regexp_replace(coalesce(p_tracking_number, ''), '\s', '', 'g'))
     or s.legacy_tracking_number = upper(regexp_replace(coalesce(p_tracking_number, ''), '\s', '', 'g'))
  order by h.created_at, h.id;
$$;

revoke execute on function get_shipment_tracking_history(text) from public;
grant execute on function get_shipment_tracking_history(text) to anon, authenticated;

-- ── 5. The correction ────────────────────────────────────────────────────
-- Statuses a correction may start from / go to. Plain SQL so the app and
-- the tests can read the same rule.
create function shipment_status_correction_targets(p_from shipment_status, p_manager boolean)
returns shipment_status[]
language sql
immutable
set search_path = public
as $$
  select case
    when p_from in ('assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivery_failed')
      or (p_manager and p_from in ('cancelled', 'returned'))
    then array(
      select s from unnest(array[
        'assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination'
      ]::shipment_status[]) as s
      where s <> p_from
    )
    else '{}'::shipment_status[]
  end;
$$;

revoke execute on function shipment_status_correction_targets(shipment_status, boolean) from public, anon;
grant execute on function shipment_status_correction_targets(shipment_status, boolean) to authenticated;

create function correct_shipment_status(
  p_shipment_id uuid,
  p_expected_status shipment_status,
  p_new_status shipment_status,
  p_reason text
)
returns shipment_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := current_app_role();
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_shipment shipments%rowtype;
begin
  if v_actor is null or v_role is null or v_role not in ('operator', 'manager') then
    raise exception 'Only operators and managers can correct a shipment status';
  end if;
  if not exists (select 1 from profiles where id = v_actor and active and deleted_at is null) then
    raise exception 'Only operators and managers can correct a shipment status';
  end if;
  if length(v_reason) < 5 then
    raise exception 'Give a reason for the correction';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters';
  end if;

  select * into v_shipment from shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'Shipment not found';
  end if;

  -- Compare-and-set: refuse to act on a status the caller didn't see.
  if v_shipment.status is distinct from p_expected_status then
    raise exception 'This shipment is now %, not % — reload it before correcting', v_shipment.status, p_expected_status;
  end if;
  if p_new_status = v_shipment.status then
    raise exception 'The shipment already has this status';
  end if;
  if v_shipment.status = 'delivered' then
    raise exception 'Delivered shipments have proof of delivery and can''t be corrected here';
  end if;
  if p_new_status = 'delivered' then
    raise exception 'Deliveries can only be completed through proof of delivery';
  end if;
  if v_shipment.status in ('cancelled', 'returned') and v_role <> 'manager' then
    raise exception 'Only a manager can re-open a cancelled or returned shipment';
  end if;
  if not (p_new_status = any (shipment_status_correction_targets(v_shipment.status, v_role = 'manager'))) then
    raise exception 'A shipment can''t be corrected from % to %', v_shipment.status, p_new_status;
  end if;
  if v_shipment.driver_id is null then
    raise exception 'Assign a driver before correcting this shipment''s delivery status';
  end if;

  perform set_config('app.status_correction_reason', v_reason, true);
  update shipments set status = p_new_status where id = p_shipment_id;
  perform set_config('app.status_correction_reason', '', true);

  insert into notifications (profile_id, type, title, body)
  values (
    v_shipment.driver_id, 'shipment.status_corrected', 'Shipment status corrected',
    v_shipment.tracking_number || ' was corrected to ' || replace(p_new_status::text, '_', ' ') || ' by operations.'
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_actor, 'shipment.status_correction', 'shipment', p_shipment_id,
    jsonb_build_object('status', v_shipment.status),
    jsonb_build_object('status', p_new_status, 'reason', v_reason)
  );

  return p_new_status;
end;
$$;

revoke execute on function correct_shipment_status(uuid, shipment_status, shipment_status, text) from public, anon;
grant execute on function correct_shipment_status(uuid, shipment_status, shipment_status, text) to authenticated;
