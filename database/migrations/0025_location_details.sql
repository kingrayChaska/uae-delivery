-- Richer pickup/drop-off locations. Additive and backward compatible: every
-- new column is nullable and existing rows are untouched.
--
-- pickup_address/pickup_lat/pickup_lng (and dropoff_*) already exist and
-- stay the source of truth: the coordinates are the delivery location, and
-- route distance and price are always calculated from them. What's added is
-- what a map point can't say on its own:
--   *_building, *_unit, *_floor, *_instructions — typed by the customer
--   (a search for "Dubai Marina" doesn't say "Marina Gate 2, apartment 1204").
--   *_place — the structured address Mapbox returned (street, neighbourhood,
--   city, ...) and how the point was chosen (search / pin / current_location).

alter table shipments
  add column pickup_building text check (pickup_building is null or char_length(pickup_building) <= 120),
  add column pickup_unit text check (pickup_unit is null or char_length(pickup_unit) <= 60),
  add column pickup_floor text check (pickup_floor is null or char_length(pickup_floor) <= 20),
  add column pickup_instructions text check (pickup_instructions is null or char_length(pickup_instructions) <= 500),
  add column pickup_place jsonb check (pickup_place is null or jsonb_typeof(pickup_place) = 'object'),
  add column dropoff_building text check (dropoff_building is null or char_length(dropoff_building) <= 120),
  add column dropoff_unit text check (dropoff_unit is null or char_length(dropoff_unit) <= 60),
  add column dropoff_floor text check (dropoff_floor is null or char_length(dropoff_floor) <= 20),
  add column dropoff_instructions text check (dropoff_instructions is null or char_length(dropoff_instructions) <= 500),
  add column dropoff_place jsonb check (dropoff_place is null or jsonb_typeof(dropoff_place) = 'object');
