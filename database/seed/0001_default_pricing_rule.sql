-- The individual Same-Day rule the booking flow depends on. Run once,
-- after the migrations. The 90 km limit is migration 0027's individual
-- limit: that migration updates rules that already exist, so a rule seeded
-- after it must carry the limit itself (null would mean no limit at all).
insert into pricing_rules (name, account_type, delivery_type, base_distance_km, base_price, additional_price_per_km, max_distance_km, currency, is_active)
values ('Standard', 'individual', 'same_day', 5, 12, 1, 90, 'AED', true);
