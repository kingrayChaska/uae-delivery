-- Duplicate-submission protection (spec section 45: "Test ... duplicate
-- submission handling"). The booking wizard generates one id per booking
-- attempt and sends it with every submit; a double-click or network retry
-- re-sends the same id. The unique index makes the database — not React
-- state — the thing that guarantees one shipment per id, even when two
-- requests race. createShipment() returns the existing shipment instead
-- of an error, so the customer just sees their booking.
alter table shipments add column client_request_id uuid;

create unique index shipments_customer_request_unique
  on shipments (customer_id, client_request_id)
  where client_request_id is not null;
