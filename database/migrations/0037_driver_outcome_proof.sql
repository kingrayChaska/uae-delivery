-- Driver outcome proof: every way a driver ends a delivery — delivered,
-- returned to the sender, or cancelled before pickup — now needs both a
-- photo and the driver's reason/note.
--
-- 1. shipment_outcome_proofs. The evidence for a driver's return or
--    cancellation: the photo (in the proof-of-delivery bucket, under the
--    shipment's folder, like delivery photos) and the reason as the driver
--    gave it. Append-only, like proof_of_delivery (0008): no write
--    policies at all; rows are only written by the two functions below.
--    Readable by the same people as proof_of_delivery and the bucket's
--    files (0013): the shipment's driver, its customer, and staff.
--    The reason also still goes in shipments.cancelled_reason /
--    delivery_failed_reason (0028), which the existing screens read; this
--    row keeps the driver's statement even if those are later edited.
--
-- 2. driver_cancel_shipment / driver_return_shipment (0028) take a
--    p_photo_path and refuse without one, checking it the way
--    complete_delivery() checks a delivery photo: inside this shipment's
--    folder, and really uploaded. The old two-argument versions are
--    dropped, so the photo can't be skipped by calling them directly.
--
-- 3. complete_delivery() (0028) also requires the driver's note (what
--    happened at handover), up to 500 characters. Signature, parameters
--    and every other rule are unchanged.

-- ── 1. Evidence table ────────────────────────────────────────────────────

create table shipment_outcome_proofs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id),
  driver_id uuid not null references profiles (id),
  outcome shipment_status not null check (outcome in ('cancelled', 'returned')),
  photo_path text not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index shipment_outcome_proofs_shipment_idx on shipment_outcome_proofs (shipment_id, created_at desc);

alter table shipment_outcome_proofs enable row level security;

create policy shipment_outcome_proofs_select on shipment_outcome_proofs
  for select
  using (
    driver_id = (select auth.uid())
    or (select is_staff())
    or shipment_id in (select id from shipments where customer_id = (select auth.uid()))
  );
-- No insert/update/delete policies: evidence is immutable once recorded.

-- ── 2. Cancel and return need a photo ────────────────────────────────────

drop function driver_cancel_shipment(uuid, text);
drop function driver_return_shipment(uuid, text);

-- Internal: the shared checks for a driver ending a delivery early. No
-- EXECUTE grant (see the revoke below).
create function driver_outcome_checked(
  p_shipment_id uuid,
  p_reason text,
  p_photo_path text,
  p_allowed shipment_status[],
  p_wrong_status_message text
)
returns text
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
  if not (v_shipment.status = any (p_allowed)) then
    raise exception '%', p_wrong_status_message;
  end if;
  if v_reason = '' then
    raise exception 'A reason is required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters';
  end if;
  if p_photo_path is null then
    raise exception 'A photo is required';
  end if;
  if not (
    p_photo_path like p_shipment_id::text || '/%'
    and exists (select 1 from storage.objects where bucket_id = 'proof-of-delivery' and name = p_photo_path)
  ) then
    raise exception 'Photo not found for this shipment';
  end if;

  return v_reason;
end;
$$;

revoke execute on function driver_outcome_checked(uuid, text, text, shipment_status[], text) from public, anon, authenticated;

create function driver_cancel_shipment(p_shipment_id uuid, p_reason text, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := driver_outcome_checked(
    p_shipment_id, p_reason, p_photo_path,
    array['driver_accepted', 'arrived_pickup']::shipment_status[],
    'Only a shipment that has not been picked up can be cancelled'
  );
begin
  insert into shipment_outcome_proofs (shipment_id, driver_id, outcome, photo_path, reason)
  values (p_shipment_id, auth.uid(), 'cancelled', p_photo_path, v_reason);
  update shipments set status = 'cancelled', cancelled_reason = v_reason where id = p_shipment_id;
end;
$$;

create function driver_return_shipment(p_shipment_id uuid, p_reason text, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := driver_outcome_checked(
    p_shipment_id, p_reason, p_photo_path,
    array['picked_up', 'in_transit', 'arrived_destination']::shipment_status[],
    'Only a picked-up shipment can be returned'
  );
begin
  insert into shipment_outcome_proofs (shipment_id, driver_id, outcome, photo_path, reason)
  values (p_shipment_id, auth.uid(), 'returned', p_photo_path, v_reason);
  update shipments set status = 'returned', delivery_failed_reason = v_reason where id = p_shipment_id;
end;
$$;

revoke execute on function driver_cancel_shipment(uuid, text, text) from public, anon;
revoke execute on function driver_return_shipment(uuid, text, text) from public, anon;
grant execute on function driver_cancel_shipment(uuid, text, text) to authenticated;
grant execute on function driver_return_shipment(uuid, text, text) to authenticated;

-- ── 3. Delivery needs a note ─────────────────────────────────────────────
-- As 0028, plus the note check after the photo check.

create or replace function complete_delivery(
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
  v_notes text := trim(coalesce(p_notes, ''));
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

  if v_notes = '' then
    raise exception 'A delivery note is required';
  end if;
  if length(v_notes) > 500 then
    raise exception 'Keep the delivery note under 500 characters';
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
    v_otp_ok, v_qr_ok, v_notes, v_collects
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
