-- Merchant bulk shipments: one pickup address per batch.
--
-- A bulk upload is collected from one place, so the merchant now enters the
-- pickup address once on the upload screen instead of in every CSV row.
-- The batch keeps it: every row is validated, routed and priced from it —
-- including by the background worker, which has no request to read it from.
-- Single bookings and manager CSV batches leave it null.
--
-- The CSV itself is now 8 columns (lib/bulk/merchant-csv.ts); every bulk
-- shipment is Next Day and COD, set by the server. No shipments columns
-- change: pickup contact, notes, fragile, package value and delivery type
-- stay for every other booking flow.

alter table shipment_batches
  add column pickup_address text
    check (pickup_address is null or char_length(pickup_address) between 5 and 300);

-- Drafts uploaded with the old 17-column template have no batch pickup
-- address and were checked under the old rules (same-day, prepaid,
-- per-row pickup). Nothing in them was booked; discard them so they can't
-- be booked under rules that no longer apply. The merchant re-uploads the
-- file with the new template.
update shipment_batches
set status = 'cancelled',
    booking_error = 'bulk.errors.outdatedDraft'
where status = 'draft'
  and pickup_address is null
  and file_name is not null;

delete from shipment_batch_rows
where batch_id in (select id from shipment_batches where status = 'cancelled' and booking_error = 'bulk.errors.outdatedDraft');
