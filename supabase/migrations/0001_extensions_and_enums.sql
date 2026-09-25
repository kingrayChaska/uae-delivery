-- Extensions
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Enums — these are the ONLY valid values the app accepts. Every enum here
-- mirrors a const array in src/lib/types.ts; keep the two in sync.

create type user_role as enum ('customer', 'driver', 'operator', 'manager');

create type shipment_status as enum (
  'pending_payment',
  'confirmed',
  'assigned',
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
  'delivered',
  'delivery_failed',
  'cancelled',
  'returned'
);

create type payment_method as enum ('card', 'cod');

create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create type cod_status as enum ('expected', 'collected', 'reconciled', 'remitted');

create type driver_availability as enum ('available', 'busy', 'offline');

create type package_type as enum ('document', 'parcel', 'fragile', 'bulk');

create type support_ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

-- Generic updated_at trigger, reused by every table below that has one.
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
