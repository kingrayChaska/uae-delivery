-- Reassigning a shipment tells the driver it was taken from.
--
-- notify_shipment_status_change() (0017, last replaced in 0028) notifies a
-- driver when a shipment is assigned to them, but nothing ever told the
-- previous driver when staff moved it to someone else. After a
-- reassignment the shipment correctly left the old driver's list
-- (shipments.driver_id holds exactly one driver), yet their "New delivery
-- assigned" notification stayed, so both drivers believed they had it.
--
-- Same function as 0028 with one addition at the end: when driver_id moves
-- from one driver to another, the previous driver gets a
-- 'shipment.unassigned' notification. A driver declining (driver_id ->
-- null, 0013) is excluded — they did it themselves.

create or replace function notify_shipment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by_driver boolean := old.driver_id is not null and old.driver_id = auth.uid();
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
