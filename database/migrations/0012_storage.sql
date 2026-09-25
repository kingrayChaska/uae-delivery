-- Package photos are uploaded by the customer during booking, before the
-- shipment row exists — so the upload-time policy scopes by the uploader's
-- own auth.uid() folder (customer_id/uuid-filename.jpg), not by shipment.
-- Once the shipment exists and references this path in
-- shipments.package_image_url, the assigned driver also needs to see it
-- (to identify the package at pickup) — that's a separate, later-evaluated
-- SELECT policy joined against shipments.
insert into storage.buckets (id, name, public)
values ('package-images', 'package-images', false)
on conflict (id) do nothing;

create policy package_images_insert on storage.objects
  for insert
  with check (
    bucket_id = 'package-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy package_images_select on storage.objects
  for select
  using (
    bucket_id = 'package-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff()
      or exists (
        select 1 from shipments
        where shipments.package_image_url = storage.objects.name
          and shipments.driver_id = auth.uid()
      )
    )
  );

-- No update/delete policies: a package photo is immutable once uploaded —
-- if the customer wants a different photo, delete the shipment draft (or,
-- once shipments exist, book again) rather than replacing evidence in place.
