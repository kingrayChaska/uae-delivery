-- Operator overrides are limited to the four operational outcomes exposed in
-- the UI. "Pending" maps to confirmed, the unassigned dispatch-queue status.
-- Managers retain the existing full status-correction behavior.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.shipment_status_override_context (
  transaction_id bigint not null,
  shipment_id uuid not null,
  primary key (transaction_id, shipment_id)
);
revoke all on table private.shipment_status_override_context from public, anon, authenticated;

create or replace function shipment_status_correction_targets(p_from shipment_status, p_manager boolean)
returns shipment_status[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(s order by s), '{}'::shipment_status[])
  from unnest(enum_range(null::shipment_status)) as s
  where s <> p_from
    and (p_manager or s in ('confirmed', 'cancelled', 'delivered', 'returned'));
$$;

create or replace function correct_shipment_status(
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
  v_cancel_block text;
  v_new_driver_id uuid;
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
  if v_shipment.status is distinct from p_expected_status then
    raise exception 'This shipment is now %, not % — reload it before correcting', v_shipment.status, p_expected_status;
  end if;
  if p_new_status = v_shipment.status then
    raise exception 'The shipment already has this status';
  end if;
  if not (p_new_status = any (shipment_status_correction_targets(v_shipment.status, v_role = 'manager'))) then
    raise exception 'Choose a valid shipment status';
  end if;

  if v_role = 'manager' then
    if p_new_status in (
      'assigned', 'driver_accepted', 'arrived_pickup', 'picked_up',
      'in_transit', 'arrived_destination', 'delivered', 'delivery_failed'
    ) and v_shipment.driver_id is null then
      raise exception 'Assign a driver before correcting this shipment to a driver status';
    end if;

    if p_new_status in ('pending_payment', 'confirmed') and v_shipment.driver_id is not null then
      raise exception 'A shipment with an assigned driver cannot be corrected to a dispatch status';
    end if;

    if p_new_status = 'pending_payment' and (
      v_shipment.payment_method <> 'card'
      or v_shipment.payment_status <> 'pending'
      or exists (
        select 1 from payments
        where shipment_id = v_shipment.id and status in ('paid', 'refunded')
      )
    ) then
      raise exception 'A shipment with an existing payment cannot be corrected to pending payment';
    end if;

    if p_new_status = 'delivered' and not exists (
      select 1 from proof_of_delivery pod
      where pod.shipment_id = v_shipment.id
        and (
          v_shipment.recipient_payment_type <> 'postpaid'
          or v_shipment.cod_amount = 0
          or pod.cod_collected
        )
    ) then
      raise exception 'Deliveries can only be corrected to delivered when required proof and COD confirmation exist';
    end if;

    if p_new_status = 'cancelled' then
      v_cancel_block := shipment_cancel_block(v_shipment.status);
      if v_cancel_block = 'picked_up' then
        raise exception 'This parcel has been picked up. The driver must return it to the sender instead';
      elsif v_cancel_block = 'delivery_failed' then
        raise exception 'This delivery failed. Mark it returned instead of cancelling it';
      elsif v_cancel_block = 'delivered' then
        raise exception 'Delivered shipments can''t be cancelled';
      elsif v_cancel_block = 'returned' then
        raise exception 'Returned shipments can''t be cancelled';
      elsif v_cancel_block = 'cancelled' then
        raise exception 'This shipment is already cancelled';
      end if;
    end if;

    if p_new_status = 'returned'
      and v_shipment.status <> 'delivery_failed'
      and not exists (
        select 1 from shipment_outcome_proofs
        where shipment_id = v_shipment.id and outcome = 'returned'
      )
      and not exists (
        select 1 from shipment_status_history
        where shipment_id = v_shipment.id and status = 'returned'
      )
    then
      raise exception 'A shipment needs a failed attempt or recorded return evidence before it can be marked returned';
    end if;
  end if;

  v_new_driver_id := case
    when v_role = 'operator' and p_new_status = 'confirmed' then null
    else v_shipment.driver_id
  end;

  insert into private.shipment_status_override_context (transaction_id, shipment_id)
  values (txid_current(), p_shipment_id);

  perform set_config('app.status_correction_reason', v_reason, true);
  update shipments
  set status = p_new_status,
      cancelled_reason = case
        when p_new_status = 'cancelled' and v_role = 'operator' then v_reason
        when p_new_status = 'cancelled' then coalesce(cancelled_reason, v_reason)
        else cancelled_reason
      end,
      delivery_failed_reason = case
        when p_new_status = 'returned' and v_role = 'operator' then v_reason
        when p_new_status in ('delivery_failed', 'returned') then coalesce(delivery_failed_reason, v_reason)
        else delivery_failed_reason
      end
  where id = p_shipment_id;
  if v_new_driver_id is distinct from v_shipment.driver_id then
    update shipments set driver_id = v_new_driver_id where id = p_shipment_id;
  end if;
  perform set_config('app.status_correction_reason', '', true);

  delete from private.shipment_status_override_context
  where transaction_id = txid_current() and shipment_id = p_shipment_id;

  if v_shipment.driver_id is not null then
    insert into notifications (profile_id, type, title, body)
    values (
      v_shipment.driver_id, 'shipment.status_corrected', 'Shipment status corrected',
      case
        when p_new_status = 'confirmed' and v_new_driver_id is null then
          v_shipment.tracking_number || ' is no longer assigned to you after an operations status override.'
        else
          v_shipment.tracking_number || ' was corrected to ' || replace(p_new_status::text, '_', ' ') || ' by operations.'
      end
    );
  end if;

  if p_new_status = 'confirmed' then
    perform notify_operators(
      'shipment.ready_for_dispatch', 'Shipment ready for dispatch',
      v_shipment.tracking_number || ' was returned to the unassigned dispatch queue by operations.'
    );
  elsif p_new_status = 'delivered' then
    insert into notifications (profile_id, type, title, body)
    values (v_shipment.customer_id, 'shipment.delivered', 'Delivery completed', 'Your shipment ' || v_shipment.tracking_number || ' has been delivered.');
  elsif p_new_status = 'cancelled' then
    insert into notifications (profile_id, type, title, body)
    values (v_shipment.customer_id, 'shipment.cancelled_by_operations', 'Shipment cancelled', v_shipment.tracking_number || ' was cancelled by ParcelLink operations.');
  elsif p_new_status = 'returned' then
    insert into notifications (profile_id, type, title, body)
    values (v_shipment.customer_id, 'shipment.returned', 'Shipment returned', v_shipment.tracking_number || ' is being returned to the sender.');
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_actor, 'shipment.status_correction', 'shipment', p_shipment_id,
    jsonb_build_object(
      'status', v_shipment.status,
      'driverId', v_shipment.driver_id,
      'cancelledReason', v_shipment.cancelled_reason,
      'deliveryFailedReason', v_shipment.delivery_failed_reason
    ),
    jsonb_build_object(
      'status', p_new_status,
      'driverId', v_new_driver_id,
      'reason', v_reason,
      'administrativeOverride', true
    )
  );

  return p_new_status;
end;
$$;

-- A correction must not create, delete, or reassign a COD transaction. In
-- particular, setting a shipment to Delivered never implies cash collection.
create or replace function sync_shipment_cod_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product numeric(10, 2) := case when new.recipient_payment_type = 'postpaid' then new.cod_amount else 0 end;
  v_fee numeric(10, 2) := case when new.payment_method = 'cod' then new.price else 0 end;
begin
  if exists (
    select 1 from private.shipment_status_override_context
    where transaction_id = txid_current() and shipment_id = new.id
  ) then
    return new;
  end if;

  if v_product + v_fee = 0 then
    return new;
  end if;

  if new.status in ('cancelled', 'returned') then
    delete from cod_transactions where shipment_id = new.id and status = 'expected';
    return new;
  end if;

  if new.driver_id is null then
    return new;
  end if;

  if exists (select 1 from cod_transactions where shipment_id = new.id and status = 'expected') then
    update cod_transactions set driver_id = new.driver_id
    where shipment_id = new.id and status = 'expected' and driver_id is distinct from new.driver_id;
  elsif not exists (select 1 from cod_transactions where shipment_id = new.id) then
    insert into cod_transactions (shipment_id, driver_id, customer_id, amount, product_amount, delivery_fee_amount, status)
    values (new.id, new.driver_id, new.customer_id, v_product + v_fee, v_product, v_fee, 'expected');
  end if;

  return new;
end;
$$;

revoke execute on function correct_shipment_status(uuid, shipment_status, shipment_status, text) from public, anon;
grant execute on function correct_shipment_status(uuid, shipment_status, shipment_status, text) to authenticated;
