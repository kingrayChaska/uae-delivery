-- Found while attack-testing Phase 9 (see database/README.md):
--
-- 1. shipments_update lets a customer update their own row, and the only
--    column guard (prevent_shipment_pricing_tampering) covers pricing. A
--    customer could therefore set driver_id and walk their own shipment
--    through legal driver-only transitions (confirmed -> assigned ->
--    driver_accepted ...). Same for a driver touching fields that aren't
--    theirs to touch.
-- 2. qr_token and delivery_otp lived on shipments, which the assigned
--    driver can SELECT — so the "secret" a driver must prove they were
--    handed by the recipient was readable straight from the table.
-- 3. proof_of_delivery was directly insertable by the driver, including
--    the recipient_otp_verified / qr_verified flags.
--
-- Fixes: a per-role update guard trigger; secrets moved to a table with
-- RLS on and no policies (only SECURITY DEFINER functions reach it);
-- OTP issuance and delivery completion done inside the database.

-- ── 1. Secrets table ─────────────────────────────────────────────────────
create table shipment_secrets (
  shipment_id uuid primary key references shipments (id) on delete cascade,
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  delivery_otp text,
  delivery_otp_attempts integer not null default 0
);

alter table shipment_secrets enable row level security;
-- Deliberately no policies: nothing reachable from a client session can
-- read or write this table directly.

insert into shipment_secrets (shipment_id, qr_token, delivery_otp)
select id, qr_token, delivery_otp from shipments;

alter table shipments drop column qr_token;
alter table shipments drop column delivery_otp;

create function create_shipment_secrets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into shipment_secrets (shipment_id) values (new.id);
  return new;
end;
$$;

create trigger shipments_create_secrets
  after insert on shipments
  for each row execute function create_shipment_secrets();

-- ── 2. Per-role update guard ─────────────────────────────────────────────
-- SECURITY INVOKER on purpose: current_user tells us whether this UPDATE
-- came straight from a client session ('authenticated') or from trusted
-- code — a SECURITY DEFINER function (current_user = its owner) or the
-- service-role client (current_user = 'service_role'). Only direct client
-- updates are restricted; the definer functions below do their own checks.
create function enforce_shipment_update_permissions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  masked shipments%rowtype;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- 'delivered' is only reachable through complete_delivery(), which
  -- verifies proof of delivery first — for every role, staff included.
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    raise exception 'Deliveries can only be completed through proof of delivery';
  end if;

  if is_staff() then
    return new;
  end if;

  masked := new;
  masked.updated_at := old.updated_at;

  if old.driver_id = auth.uid() then
    if new.status is distinct from old.status and new.status not in (
      'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivery_failed'
    ) then
      raise exception 'Drivers cannot set status %', new.status;
    end if;
    masked.status := old.status;
    masked.delivery_failed_reason := old.delivery_failed_reason;
    if masked is distinct from old then
      raise exception 'Drivers may only update delivery status and failure reason';
    end if;
    return new;
  end if;

  if old.customer_id = auth.uid() then
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'Customers can only cancel a shipment';
    end if;
    masked.status := old.status;
    masked.cancelled_reason := old.cancelled_reason;
    if masked is distinct from old then
      raise exception 'Customers may only cancel a shipment';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update this shipment';
end;
$$;

create trigger shipments_enforce_update_permissions
  before update on shipments
  for each row execute function enforce_shipment_update_permissions();

-- ── 3. OTP issuance ──────────────────────────────────────────────────────
-- Generates the code, stores it in shipment_secrets, and delivers it to
-- the customer's notification feed — all inside the database, so the
-- code never passes through the driver's session at all.
create function issue_delivery_otp(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments%rowtype;
  v_code text;
begin
  select * into v_shipment from shipments where id = p_shipment_id;

  if not found or v_shipment.driver_id is distinct from auth.uid() then
    raise exception 'Not authorized for this shipment';
  end if;
  if v_shipment.status <> 'arrived_destination' then
    raise exception 'Arrive at the destination before requesting a code';
  end if;

  v_code := lpad(((get_byte(gen_random_bytes(2), 0) * 256 + get_byte(gen_random_bytes(2), 1)) % 10000)::text, 4, '0');

  update shipment_secrets
  set delivery_otp = v_code, delivery_otp_attempts = 0
  where shipment_id = p_shipment_id;

  insert into notifications (profile_id, type, title, body)
  values (
    v_shipment.customer_id,
    'delivery.otp',
    'Delivery verification code',
    'Share this code with your driver to confirm delivery of ' || v_shipment.tracking_number || ': ' || v_code
  );
end;
$$;

grant execute on function issue_delivery_otp(uuid) to authenticated;

-- ── 4. Delivery completion ───────────────────────────────────────────────
-- The only path to 'delivered'. Verifies OTP/QR against shipment_secrets,
-- checks any photo/signature path actually exists in this shipment's
-- proof-of-delivery folder, requires at least one proof, then records
-- proof_of_delivery and flips status — atomically.
create function complete_delivery(
  p_shipment_id uuid,
  p_recipient_name text,
  p_photo_path text default null,
  p_signature_path text default null,
  p_otp text default null,
  p_qr_token text default null,
  p_notes text default null
)
-- Returns 'delivered' on success or 'invalid_otp' for a wrong code. A
-- wrong code can't RAISE: that would roll back the attempt counter and
-- make the 5-attempt limit useless against guessing.
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments%rowtype;
  v_secrets shipment_secrets%rowtype;
  v_otp_ok boolean := false;
  v_qr_ok boolean := false;
  v_photo_ok boolean := false;
  v_signature_ok boolean := false;
begin
  select * into v_shipment from shipments where id = p_shipment_id for update;

  if not found or v_shipment.driver_id is distinct from auth.uid() then
    raise exception 'Not authorized for this shipment';
  end if;
  if v_shipment.status <> 'arrived_destination' then
    raise exception 'Arrive at the destination before completing delivery';
  end if;
  if coalesce(trim(p_recipient_name), '') = '' then
    raise exception 'Recipient name is required';
  end if;

  select * into v_secrets from shipment_secrets where shipment_id = p_shipment_id for update;

  if p_otp is not null then
    if v_secrets.delivery_otp is null or v_secrets.delivery_otp_attempts >= 5 then
      raise exception 'No valid code — request a new one';
    end if;
    if p_otp <> v_secrets.delivery_otp then
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

  if p_photo_path is not null then
    v_photo_ok := p_photo_path like p_shipment_id::text || '/%'
      and exists (select 1 from storage.objects where bucket_id = 'proof-of-delivery' and name = p_photo_path);
    if not v_photo_ok then
      raise exception 'Photo not found for this shipment';
    end if;
  end if;

  if p_signature_path is not null then
    v_signature_ok := p_signature_path like p_shipment_id::text || '/%'
      and exists (select 1 from storage.objects where bucket_id = 'proof-of-delivery' and name = p_signature_path);
    if not v_signature_ok then
      raise exception 'Signature not found for this shipment';
    end if;
  end if;

  if not (v_otp_ok or v_qr_ok or v_photo_ok or v_signature_ok) then
    raise exception 'Provide at least one proof: photo, signature, OTP, or QR scan';
  end if;

  insert into proof_of_delivery (
    shipment_id, driver_id, photo_url, signature_url, recipient_name,
    recipient_otp_verified, qr_verified, notes
  ) values (
    p_shipment_id, auth.uid(), p_photo_path, p_signature_path, p_recipient_name,
    v_otp_ok, v_qr_ok, p_notes
  );

  update shipments set status = 'delivered' where id = p_shipment_id;
  update shipment_secrets set delivery_otp = null where shipment_id = p_shipment_id;
  return 'delivered';
end;
$$;

grant execute on function complete_delivery(uuid, text, text, text, text, text, text) to authenticated;

-- Drivers no longer insert proof_of_delivery directly — only
-- complete_delivery() does, after verification.
drop policy proof_of_delivery_insert on proof_of_delivery;
