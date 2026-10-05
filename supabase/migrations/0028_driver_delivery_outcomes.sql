-- Driver delivery outcomes: proof of delivery without a recipient name,
-- explicit cash-on-delivery confirmation, and driver-initiated
-- cancellations and returns.
--
-- 1. complete_delivery() no longer requires a recipient name. A delivery
--    photo is now required (the other proofs stay optional extras), and a
--    postpaid shipment needs the driver's explicit confirmation that the
--    COD amount was collected. The confirmation is stored on the proof row
--    (proof_of_delivery.cod_collected) and the shipment's expected COD
--    record is marked collected in the same transaction.
-- 2. 'cancelled' and 'returned' already exist in shipment_status; only the
--    driver couldn't reach them. Two narrow SECURITY DEFINER functions give
--    the assigned driver exactly those changes, the same way
--    decline_shipment_assignment() (0013) does, instead of widening
--    enforce_shipment_update_permissions (0015):
--      driver_cancel_shipment  before pickup (driver_accepted, arrived_pickup)
--      driver_return_shipment  after pickup (picked_up, in_transit, arrived_destination)
--    The reasons go in the existing columns: cancelled_reason, and
--    delivery_failed_reason for a return (why the parcel wasn't delivered —
--    the same column the operator's delivery_failed -> returned path
--    already uses), so no new reason column is needed.
-- 3. The state machine gains the transitions those need. Nothing is
--    removed, and 'delivered', 'cancelled' and 'returned' stay terminal.
-- 4. Notifications: a driver cancellation or return tells the customer and
--    operations; previously a cancellation always told the driver it was
--    "cancelled by the customer", and nobody was told about a return.

-- ── 1. State machine ─────────────────────────────────────────────────────
insert into shipment_status_transitions (from_status, to_status) values
  ('arrived_pickup', 'cancelled'),
  ('picked_up', 'returned'),
  ('in_transit', 'returned'),
  ('arrived_destination', 'returned')
on conflict do nothing;

-- ── 2. Proof of delivery ─────────────────────────────────────────────────
-- The driver's own statement at handover. cod_transactions (0007/0022)
-- remains the cash ledger; this records that the confirmation was given
-- as part of this proof.
alter table proof_of_delivery
  add column cod_collected boolean not null default false;

-- Same parameter names as before, so existing named calls keep working;
-- the recipient name is now optional and a confirmation flag is added.
drop function complete_delivery(uuid, text, text, text, text, text, text);

create function complete_delivery(
  p_shipment_id uuid,
  p_recipient_name text default null,
  p_photo_path text default null,
  p_signature_path text default null,
  p_otp text default null,
  p_qr_token text default null,
  p_notes text default null,
  p_cod_collected boolean default false
)
-- Returns 'delivered' on success or 'invalid_otp' for a wrong code. A
-- wrong code can't RAISE: that would roll back the attempt counter and
-- make the 5-attempt limit useless against guessing.
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_shipment shipments%rowtype;
  v_secrets shipment_secrets%rowtype;
  v_otp_ok boolean := false;
  v_qr_ok boolean := false;
  v_signature_ok boolean := false;
  -- What the recipient pays at the door: the goods amount only, never the
  -- delivery fee (see 0022, shipments.cod_amount).
  v_collects boolean;
begin
  select * into v_shipment from shipments where id = p_shipment_id for update;

  if not found or v_shipment.driver_id is distinct from auth.uid() then
    raise exception 'Not authorized for this shipment';
  end if;
  if v_shipment.status <> 'arrived_destination' then
    raise exception 'Arrive at the destination before completing delivery';
  end if;

  if p_photo_path is null then
    raise exception 'A delivery photo is required';
  end if;
  if not (
    p_photo_path like p_shipment_id::text || '/%'
    and exists (select 1 from storage.objects where bucket_id = 'proof-of-delivery' and name = p_photo_path)
  ) then
    raise exception 'Photo not found for this shipment';
  end if;

  v_collects := v_shipment.recipient_payment_type = 'postpaid' and v_shipment.cod_amount > 0;
  if v_collects and not coalesce(p_cod_collected, false) then
    raise exception 'Confirm the cash on delivery amount was collected';
  end if;

  select * into v_secrets from shipment_secrets where shipment_id = p_shipment_id for update;

  if p_otp is not null then
    if v_secrets.delivery_otp is null or v_secrets.delivery_otp_attempts >= 5 then
      raise exception 'No valid code — request a new one';
    end if;
    if crypt(p_otp, v_secrets.delivery_otp) <> v_secrets.delivery_otp then
      update shipment_secrets set delivery_otp_attempts = delivery_otp_attempts + 1
      where shipment_id = p_shipment_id;
      return 'invalid_otp';
    end if;
    v_otp_ok := true;
  end if;

  if p_qr_token is not null then
    if p_qr_token <> v_secrets.qr_token then
      raise exception 'QR code does not match this shipment';
    end if;
    v_qr_ok := true;
  end if;

  if p_signature_path is not null then
    v_signature_ok := p_signature_path like p_shipment_id::text || '/%'
      and exists (select 1 from storage.objects where bucket_id = 'proof-of-delivery' and name = p_signature_path);
    if not v_signature_ok then
      raise exception 'Signature not found for this shipment';
    end if;
  end if;

  insert into proof_of_delivery (
    shipment_id, driver_id, photo_url, signature_url, recipient_name,
    recipient_otp_verified, qr_verified, notes, cod_collected
  ) values (
    p_shipment_id, auth.uid(), p_photo_path, p_signature_path, nullif(trim(p_recipient_name), ''),
    v_otp_ok, v_qr_ok, nullif(trim(p_notes), ''), v_collects
  );

  -- The expected COD record (created at assignment, 0022) is now cash in
  -- the driver's hands. A record the driver already marked collected is
  -- left as it is.
  if v_collects then
    update cod_transactions
    set status = 'collected', collected_at = now()
    where shipment_id = p_shipment_id and status = 'expected';
  end if;

  update shipments set status = 'delivered' where id = p_shipment_id;
  update shipment_secrets set delivery_otp = null where shipment_id = p_shipment_id;
  return 'delivered';
end;
$$;

revoke execute on function complete_delivery(uuid, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function complete_delivery(uuid, text, text, text, text, text, text, boolean) to authenticated;

-- ── 3. Driver cancellation and return ────────────────────────────────────
create function driver_cancel_shipment(p_shipment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select * into v_shipment from shipments where id = p_shipment_id for update;

  if not found or v_shipment.driver_id is distinct from auth.uid() then
    raise exception 'Not authorized for this shipment';
  end if;
  if v_shipment.status not in ('driver_accepted', 'arrived_pickup') then
    raise exception 'Only a shipment that has not been picked up can be cancelled';
  end if;
  if v_reason = '' then
    raise exception 'A reason is required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters';
  end if;

  update shipments set status = 'cancelled', cancelled_reason = v_reason where id = p_shipment_id;
end;
$$;

create function driver_return_shipment(p_shipment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select * into v_shipment from shipments where id = p_shipment_id for update;

  if not found or v_shipment.driver_id is distinct from auth.uid() then
    raise exception 'Not authorized for this shipment';
  end if;
  if v_shipment.status not in ('picked_up', 'in_transit', 'arrived_destination') then
    raise exception 'Only a picked-up shipment can be returned';
  end if;
  if v_reason = '' then
    raise exception 'A reason is required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters';
  end if;

  update shipments set status = 'returned', delivery_failed_reason = v_reason where id = p_shipment_id;
end;
$$;

revoke execute on function driver_cancel_shipment(uuid, text) from public, anon;
revoke execute on function driver_return_shipment(uuid, text) from public, anon;
grant execute on function driver_cancel_shipment(uuid, text) to authenticated;
grant execute on function driver_return_shipment(uuid, text) to authenticated;

-- ── 4. Notifications ─────────────────────────────────────────────────────
-- As 0017, with the 'cancelled' branch split by who cancelled and a new
-- 'returned' branch. auth.uid() is the session that made the change.
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
  end if;

  return new;
end;
$$;
