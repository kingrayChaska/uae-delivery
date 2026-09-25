-- Phase 12 security hardening. Every item here came out of the Phase 12
-- audit (see SECURITY.md):
--
-- 1. Postgres grants EXECUTE on new functions to PUBLIC by default, so any
--    signed-in user could call notify_operators() directly and send an
--    arbitrary message to every operator and manager — a phishing channel.
-- 2. Tracking numbers were sequential, so the public tracking lookup could
--    be walked to see every active shipment's status and driver position.
-- 3. Rate limiting needs shared storage across serverless instances.
-- 4. Delivery OTPs were stored in plaintext.
-- 5. Upload size/type limits were only enforced in the browser.

-- ── 1. Function execute privileges ───────────────────────────────────────
revoke execute on function notify_operators(text, text, text) from public, anon, authenticated;

-- Future functions in this schema start with no execute grant at all, so
-- each one must be granted deliberately (as 0011/0013/0015/0017 already do).
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ── 2. Unguessable tracking numbers ──────────────────────────────────────
-- DLV-YYYYMMDD-XXXXXXXX: 8 characters from a 31-symbol alphabet (no
-- 0/O/1/I/L to avoid misreads on labels and phone calls) = ~8.5e11
-- combinations per day. Combined with the tracking lookup's rate limit and
-- Turnstile check, enumerating them is not practical. The unique constraint
-- on shipments.tracking_number remains the backstop.
create or replace function generate_tracking_number()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea := gen_random_bytes(8);
  suffix text := '';
begin
  for i in 0..7 loop
    suffix := suffix || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return 'DLV-' || to_char(now(), 'YYYYMMDD') || '-' || suffix;
end;
$$;

-- ── 3. Rate limiting ─────────────────────────────────────────────────────
create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table rate_limits enable row level security;
-- No policies: only check_rate_limit() (called with the service-role key
-- from lib/security/rate-limit.ts) ever touches this table.

-- Fixed-window counter. Atomic under concurrency: the whole
-- read-modify-write is a single INSERT ... ON CONFLICT statement.
create function check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case
      when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else rate_limits.window_start
    end
  returning count into v_count;

  -- Opportunistic cleanup, so the table doesn't grow without bound and no
  -- scheduled job is needed.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

revoke execute on function check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function check_rate_limit(text, integer, integer) to service_role;

-- ── 4. Hash delivery OTPs ────────────────────────────────────────────────
-- Any plaintext code issued before this migration is invalidated; the
-- driver simply requests a new one.
update shipment_secrets set delivery_otp = null, delivery_otp_attempts = 0 where delivery_otp is not null;

create or replace function issue_delivery_otp(p_shipment_id uuid)
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

  -- Stored as a bcrypt hash: the plaintext only ever exists in the
  -- customer's notification below.
  update shipment_secrets
  set delivery_otp = crypt(v_code, gen_salt('bf', 8)), delivery_otp_attempts = 0
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

create or replace function complete_delivery(
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

-- ── 5. Storage limits enforced by Supabase Storage itself ───────────────
-- The browser checks type and size too, but a direct API call skips the
-- browser. These bucket settings are enforced server-side on every upload.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('package-images', 'proof-of-delivery');
