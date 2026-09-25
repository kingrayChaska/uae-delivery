-- pricing_rules: the app never hard-codes "5", "12" or "1" — every price
-- calculation (lib/pricing/calculate.ts) is given the currently active row
-- from this table. See database/seed/0001_default_pricing_rule.sql for the
-- initial 5km/AED12/AED1-per-km rule.
create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_distance_km numeric(6, 2) not null check (base_distance_km >= 0),
  base_price numeric(10, 2) not null check (base_price >= 0),
  additional_price_per_km numeric(10, 2) not null check (additional_price_per_km >= 0),
  currency text not null default 'AED',
  is_active boolean not null default false,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pricing_rules_set_updated_at
  before update on pricing_rules
  for each row execute function set_updated_at();

-- Exactly one active rule at a time: activating a rule deactivates every
-- other one, so "the active pricing rule" is always an unambiguous single
-- row the way the booking flow and Manager pricing screen both expect.
create function enforce_single_active_pricing_rule()
returns trigger
language plpgsql
as $$
begin
  if new.is_active then
    update pricing_rules set is_active = false where id <> new.id and is_active;
  end if;
  return new;
end;
$$;

create trigger pricing_rules_enforce_single_active
  before insert or update on pricing_rules
  for each row execute function enforce_single_active_pricing_rule();

alter table pricing_rules enable row level security;

-- Active pricing is public information — the landing page's pricing
-- section and the booking flow's quote both need to read it, including
-- from an unauthenticated session. Inactive/historical rules are visible
-- to staff only (used for the Manager's pricing-change audit trail).
create policy pricing_rules_select_active on pricing_rules
  for select
  using (is_active or is_staff());

-- Only a Manager manages pricing (spec section 22: Operators CANNOT change
-- system pricing).
create policy pricing_rules_insert on pricing_rules for insert with check (is_manager());
create policy pricing_rules_update on pricing_rules
  for update using (is_manager()) with check (is_manager());
