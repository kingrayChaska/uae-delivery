-- proof_of_delivery: at least one verification mechanism (photo, signature,
-- OTP or QR) is required before a shipment can move to 'delivered' — that
-- rule is enforced in the booking/delivery server action (Phase 8), since
-- it depends on business logic ("at least one of N fields"), not something
-- a single CHECK constraint expresses cleanly. This table itself is
-- append-only: once evidence is submitted, it is never edited or deleted.
create table proof_of_delivery (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id),
  driver_id uuid not null references profiles (id),
  photo_url text,
  signature_url text,
  recipient_name text,
  recipient_otp_verified boolean not null default false,
  qr_verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index proof_of_delivery_shipment_idx on proof_of_delivery (shipment_id);

alter table proof_of_delivery enable row level security;

-- Customer sees proof for their own shipment; driver sees their own
-- submissions; staff see everything (exception handling, disputes).
create policy proof_of_delivery_select on proof_of_delivery
  for select
  using (
    driver_id = auth.uid()
    or is_staff()
    or shipment_id in (select id from shipments where customer_id = auth.uid())
  );

-- Only the assigned driver can submit proof of delivery, and only for the
-- shipment they're actually assigned to.
create policy proof_of_delivery_insert on proof_of_delivery
  for insert
  with check (
    driver_id = auth.uid()
    and shipment_id in (select id from shipments where driver_id = auth.uid())
  );
-- No update/delete policies at all: evidence is immutable once submitted.
