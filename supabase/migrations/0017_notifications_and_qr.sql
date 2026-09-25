-- Phase 11. Two things:
--
-- 1. Notification triggers. Status changes reach `shipments` through four
--    different code paths (customer cancel, driver status advance,
--    operator assign/reassign, and the complete_delivery /
--    decline_shipment_assignment functions). Scattering notification
--    inserts across each of those call sites would inevitably miss one —
--    a single AFTER trigger on the table itself is the one place that
--    sees every path, so it's the only reliable place to fire from.
--    (lib/dispatch/actions.ts's app-level notification insert is removed
--    in this same phase, now that the trigger covers it — see the app
--    code diff.)
-- 2. QR token access. shipment_secrets (migration 0015) has RLS on and
--    zero policies — nothing can read qr_token directly. Printing a label
--    and optionally verifying a scan at pickup both need narrow,
--    purpose-built functions instead.

-- ── Notification triggers ────────────────────────────────────────────────

create function notify_operators(p_type text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (profile_id, type, title, body)
  select id, p_type, p_title, p_body
  from profiles
  where role in ('operator', 'manager') and active;
end;
$$;

create function notify_shipment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (profile_id, type, title, body)
  values (
    new.customer_id, 'shipment.booked', 'Booking created',
    'Your shipment ' || new.tracking_number || ' has been booked.'
  );

  -- COD bookings start life already 'confirmed' (no payment to wait on) —
  -- that's the point at which dispatch can actually act on them.
  if new.status = 'confirmed' then
    perform notify_operators(
      'shipment.ready_for_dispatch', 'New shipment ready for dispatch',
      new.tracking_number || ' is confirmed and awaiting a driver.'
    );
  end if;

  return new;
end;
$$;

create trigger shipments_notify_created
  after insert on shipments
  for each row execute function notify_shipment_created();

create function notify_shipment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'confirmed' and old.status = 'pending_payment' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'payment.success', 'Payment successful', 'Payment for ' || new.tracking_number || ' was received.');
      perform notify_operators(
        'shipment.ready_for_dispatch', 'New shipment ready for dispatch',
        new.tracking_number || ' is confirmed and awaiting a driver.'
      );

    elsif new.status = 'confirmed' and old.status = 'assigned' then
      -- Only decline_shipment_assignment() produces this exact
      -- transition (assigned -> confirmed with driver_id cleared) — see
      -- migration 0013.
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

    elsif new.status = 'cancelled' and old.driver_id is not null then
      insert into notifications (profile_id, type, title, body)
      values (old.driver_id, 'shipment.cancelled', 'Delivery cancelled', new.tracking_number || ' was cancelled by the customer.');
    end if;
  end if;

  if new.driver_id is distinct from old.driver_id and new.driver_id is not null then
    insert into notifications (profile_id, type, title, body)
    values (new.driver_id, 'shipment.assigned', 'New delivery assigned', 'You''ve been assigned ' || new.tracking_number || '.');
  end if;

  return new;
end;
$$;

create trigger shipments_notify_status_change
  after update on shipments
  for each row execute function notify_shipment_status_change();

-- ── QR access ─────────────────────────────────────────────────────────────

-- For printing a label. Same visibility as the shipment itself: the
-- customer, staff, or the assigned driver.
create function get_shipment_qr_token(p_shipment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shipment shipments%rowtype;
  v_token text;
begin
  select * into v_shipment from shipments where id = p_shipment_id;
  if not found then
    raise exception 'Shipment not found';
  end if;
  if v_shipment.customer_id <> auth.uid() and v_shipment.driver_id is distinct from auth.uid() and not is_staff() then
    raise exception 'Not authorized for this shipment';
  end if;

  select qr_token into v_token from shipment_secrets where shipment_id = p_shipment_id;
  return v_token;
end;
$$;

grant execute on function get_shipment_qr_token(uuid) to authenticated;

-- Read-only check for an optional "verify at pickup" scan (spec section
-- 34) — unlike complete_delivery, this doesn't change any state, so a
-- driver can scan without it counting as anything official. It does not
-- reveal the correct token: it only ever returns whether the guess matches.
create function verify_shipment_qr(p_shipment_id uuid, p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_token text;
begin
  select driver_id into v_driver_id from shipments where id = p_shipment_id;
  if v_driver_id is distinct from auth.uid() then
    raise exception 'Not authorized for this shipment';
  end if;

  select qr_token into v_token from shipment_secrets where shipment_id = p_shipment_id;
  return v_token = p_token;
end;
$$;

grant execute on function verify_shipment_qr(uuid, text) to authenticated;
