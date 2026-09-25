-- A driver can decline an assignment (spec section 32 mentions "Driver
-- rejects assignment" as an auditable event Operators are notified of).
-- Missing from the original state machine: 'assigned' only ever advanced
-- forward. Add the back-transition so a decline can return the shipment
-- to the dispatch pool.
insert into shipment_status_transitions (from_status, to_status) values
  ('assigned', 'confirmed');

-- Declining needs to null out driver_id so the shipment reappears as
-- unassigned for Operator dispatch — but a driver's own RLS update policy
-- (shipments_update) requires the NEW row to still satisfy
-- driver_id = auth.uid() / is_staff() / customer_id = auth.uid(), which a
-- null driver_id never would. A SECURITY DEFINER function is the clean
-- way to allow this one specific, well-checked state change without
-- loosening the general update policy.
create function decline_shipment_assignment(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments%rowtype;
begin
  select * into v_shipment from shipments where id = p_shipment_id for update;

  if not found then
    raise exception 'Shipment not found';
  end if;
  if v_shipment.driver_id is distinct from auth.uid() then
    raise exception 'Not authorized to decline this shipment';
  end if;
  if v_shipment.status <> 'assigned' then
    raise exception 'This shipment can no longer be declined';
  end if;

  update shipments set driver_id = null, status = 'confirmed' where id = p_shipment_id;
end;
$$;

grant execute on function decline_shipment_assignment(uuid) to authenticated;

-- Recipient OTP verification (one of the proof-of-delivery mechanisms,
-- spec section 19). No SMS provider is configured in this build, so the
-- code is delivered via the customer's in-app notification feed rather
-- than text message — see lib/driver/actions.ts requestDeliveryOtpAction.
-- Nullable, cleared once delivered.
alter table shipments add column delivery_otp text;

-- Proof-of-delivery evidence (photos, signatures), one shipment per
-- folder — unlike package-images (folder-scoped by uploader, uploaded
-- before the shipment exists), this is uploaded by the assigned driver
-- after the shipment already exists, so it's scoped by shipment_id and
-- checked via a join back to `shipments` rather than auth.uid() directly.
insert into storage.buckets (id, name, public)
values ('proof-of-delivery', 'proof-of-delivery', false)
on conflict (id) do nothing;

create policy proof_of_delivery_images_insert on storage.objects
  for insert
  with check (
    bucket_id = 'proof-of-delivery'
    and exists (
      select 1 from shipments
      where shipments.id::text = (storage.foldername(name))[1]
        and shipments.driver_id = auth.uid()
    )
  );

create policy proof_of_delivery_images_select on storage.objects
  for select
  using (
    bucket_id = 'proof-of-delivery'
    and exists (
      select 1 from shipments
      where shipments.id::text = (storage.foldername(name))[1]
        and (
          shipments.driver_id = auth.uid()
          or shipments.customer_id = auth.uid()
          or public.is_staff()
        )
    )
  );

-- No update/delete policies: delivery evidence is immutable, same as
-- package-images.
