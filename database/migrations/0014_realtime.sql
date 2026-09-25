-- The live dispatch map (Operator/Manager) subscribes to driver location
-- pings and shipment status/assignment changes via postgres_changes.
-- Supabase's realtime-js client applies each subscriber's own RLS when
-- listening — a driver's or customer's subscription is scoped exactly
-- the same as their normal reads would be, so no separate "realtime"
-- policies are needed beyond what migrations 0006/0007 already define.

alter publication supabase_realtime add table shipments;
alter publication supabase_realtime add table driver_locations;

-- REPLICA IDENTITY FULL so UPDATE/DELETE change events include the old row
-- values (e.g. previous status), not just the primary key — useful for the
-- dispatch board to diff what changed without a extra round-trip.
alter table shipments replica identity full;
alter table driver_locations replica identity full;
