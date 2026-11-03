-- Operators correct mistaken driver statuses across the full canonical
-- lifecycle. Corrections append history and audit records; they never edit
-- or delete proof-of-delivery or driver outcome evidence.

create or replace function shipment_status_correction_targets(p_from shipment_status, p_manager boolean)
returns shipment_status[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(s order by s), '{}'::shipment_status[])
  from unnest(enum_range(null::shipment_status)) as s
  where s <> p_from;
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

  perform set_config('app.status_correction_reason', v_reason, true);
  update shipments
  set status = p_new_status,
      cancelled_reason = case
        when p_new_status = 'cancelled' then coalesce(cancelled_reason, v_reason)
        else cancelled_reason
      end,
      delivery_failed_reason = case
        when p_new_status in ('delivery_failed', 'returned') then coalesce(delivery_failed_reason, v_reason)
        else delivery_failed_reason
      end
  where id = p_shipment_id;
  perform set_config('app.status_correction_reason', '', true);

  if v_shipment.driver_id is not null then
    insert into notifications (profile_id, type, title, body)
    values (
      v_shipment.driver_id, 'shipment.status_corrected', 'Shipment status corrected',
      v_shipment.tracking_number || ' was corrected to ' || replace(p_new_status::text, '_', ' ') || ' by operations.'
    );
  end if;

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
