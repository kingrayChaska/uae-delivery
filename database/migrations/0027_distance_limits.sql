-- Distance limits per account type:
--   merchants   no limit at all — they can send to any distance.
--   individuals 90 km (was 50 km).
--
-- A null max_distance_km now means "no limit". The existing check
-- (max_distance_km > 0) already allows null; shipment_price_is_valid()
-- treats a null limit as never exceeded (`distance > null` is not true).

alter table pricing_rules
  alter column max_distance_km drop not null,
  alter column max_distance_km drop default;

update pricing_rules set max_distance_km = null where account_type = 'merchant';
update pricing_rules set max_distance_km = 90 where account_type = 'individual';

-- A booking without a pricing rule used to take the largest active limit
-- for its delivery type, across account types. With merchant rules now
-- unlimited (null) that would apply the individual limit to merchants, so
-- the limit now comes from the customer's own account type.
create or replace function enforce_shipment_distance_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max numeric;
begin
  if new.pricing_rule_id is not null then
    select max_distance_km into v_max from pricing_rules where id = new.pricing_rule_id;
  else
    select r.max_distance_km into v_max
    from pricing_rules r
    join profiles p on p.id = new.customer_id and p.account_type = r.account_type
    where r.is_active and r.delivery_type = new.delivery_type;
  end if;

  if v_max is not null and new.distance_km > v_max then
    raise exception 'This delivery is % km, beyond the % km ParcelLink delivery limit', new.distance_km, v_max;
  end if;
  return new;
end;
$$;
