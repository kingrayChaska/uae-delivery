-- The /tracking route is explicitly public (spec section 43) — an
-- anonymous visitor enters a tracking number with no login. The
-- shipments_select RLS policy deliberately does NOT allow this (it would
-- mean anyone who knows/guesses a tracking number could read the full row:
-- customer name, phone numbers, exact addresses, price). Instead, this is
-- a SECURITY DEFINER function that returns only the fields a public
-- tracking page actually needs — status, ETA, and the driver's live
-- location while a delivery is actually in progress — and nothing that
-- identifies the customer, the driver, or exact addresses.
create type public_tracking_result as (
  tracking_number text,
  status shipment_status,
  created_at timestamptz,
  distance_km numeric,
  estimated_duration_minutes integer,
  driver_lat double precision,
  driver_lng double precision,
  driver_location_updated_at timestamptz
);

create function get_shipment_tracking(p_tracking_number text)
returns public_tracking_result
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result public_tracking_result;
  s shipments%rowtype;
  loc driver_locations%rowtype;
begin
  select * into s from shipments where tracking_number = p_tracking_number;
  if not found then
    return null;
  end if;

  result.tracking_number := s.tracking_number;
  result.status := s.status;
  result.created_at := s.created_at;
  result.distance_km := s.distance_km;
  result.estimated_duration_minutes := s.duration_minutes;

  -- Only surface a live driver position while the delivery is actually
  -- moving — not before assignment, not after it's finished.
  if s.status in ('driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination') then
    select * into loc from driver_locations
    where shipment_id = s.id
    order by recorded_at desc
    limit 1;

    if found then
      result.driver_lat := loc.lat;
      result.driver_lng := loc.lng;
      result.driver_location_updated_at := loc.recorded_at;
    end if;
  end if;

  return result;
end;
$$;

-- The status timeline for the tracking-page checklist (Booking Confirmed /
-- Driver Assigned / Picked Up / ... per spec section 17) — same PII-safe
-- reasoning as above.
create function get_shipment_tracking_history(p_tracking_number text)
returns table (status shipment_status, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.status, h.created_at
  from shipment_status_history h
  join shipments s on s.id = h.shipment_id
  where s.tracking_number = p_tracking_number
  order by h.created_at;
$$;

-- Deliberately grantable to anon: the functions themselves are the access
-- control (they return only safe fields), not row-level policies.
grant execute on function get_shipment_tracking(text) to anon, authenticated;
grant execute on function get_shipment_tracking_history(text) to anon, authenticated;
