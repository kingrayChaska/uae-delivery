-- Exhaustive shipment status state-machine test (spec section 45: "Test
-- every status transition"). Tries all 12 x 12 = 144 (from, to) pairs and
-- compares the database's verdict to the EXPECTED list below — written out
-- here independently rather than read from shipment_status_transitions, so
-- the test can actually disagree with the implementation.
--
-- Runs as superuser on purpose: this isolates the state machine itself from
-- the per-role guards (those are covered by attacks.sql).
--
-- Usage: after run.sh,  psql -d uae_delivery_test -f transitions.sql

\set ON_ERROR_STOP 1
set client_min_messages = warning;

create temp table expected_transitions (from_status shipment_status, to_status shipment_status);
insert into expected_transitions values
  ('pending_payment', 'confirmed'), ('pending_payment', 'cancelled'),
  ('confirmed', 'assigned'), ('confirmed', 'cancelled'),
  ('assigned', 'driver_accepted'), ('assigned', 'cancelled'), ('assigned', 'confirmed'),
  ('driver_accepted', 'arrived_pickup'), ('driver_accepted', 'cancelled'),
  ('arrived_pickup', 'picked_up'), ('arrived_pickup', 'delivery_failed'), ('arrived_pickup', 'cancelled'),
  ('picked_up', 'in_transit'), ('picked_up', 'returned'),
  ('in_transit', 'arrived_destination'), ('in_transit', 'delivery_failed'), ('in_transit', 'returned'),
  ('arrived_destination', 'delivered'), ('arrived_destination', 'delivery_failed'), ('arrived_destination', 'returned'),
  ('delivery_failed', 'assigned'), ('delivery_failed', 'returned');
  -- delivered, cancelled, returned: terminal (no outgoing transitions).

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'matrix@test.com')
on conflict do nothing;

create temp table transition_results (from_status shipment_status, to_status shipment_status, allowed boolean);

do $$
declare
  f shipment_status;
  t shipment_status;
  v_id uuid;
  v_allowed boolean;
begin
  foreach f in array enum_range(null::shipment_status) loop
    foreach t in array enum_range(null::shipment_status) loop
      continue when f = t;
      insert into shipments (
        customer_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
        distance_km, duration_minutes, price, currency, payment_method, package_type
      ) values (
        '00000000-0000-0000-0000-0000000000aa', f, 'A', 25, 55, 'x', 'x', 'B', 25.1, 55.1, 'y', 'y',
        5, 10, 12, 'AED', 'cod', 'parcel'
      ) returning id into v_id;

      begin
        update shipments set status = t where id = v_id;
        v_allowed := true;
      exception when others then
        v_allowed := false;
      end;

      insert into transition_results values (f, t, v_allowed);
    end loop;
  end loop;
end;
$$;

\echo '--- mismatches (must be empty) ---'
select r.from_status, r.to_status,
       case when r.allowed then 'ALLOWED but should be BLOCKED' else 'BLOCKED but should be ALLOWED' end as problem
from transition_results r
left join expected_transitions e on e.from_status = r.from_status and e.to_status = r.to_status
where r.allowed <> (e.from_status is not null)
order by 1, 2;

select format('TRANSITION MATRIX: %s pairs checked, %s allowed, %s mismatches',
  count(*),
  count(*) filter (where allowed),
  count(*) filter (where allowed <> exists (
    select 1 from expected_transitions e where e.from_status = r.from_status and e.to_status = r.to_status))
) as summary
from transition_results r;
