-- Found by probing before building the Manager dashboard (Phase 10):
--
-- 1. shipment_price_is_valid() accepted ANY pricing rule, including
--    inactive ones. After a Manager changes pricing, a customer calling
--    the REST API directly could keep booking at a retired, cheaper rate.
-- 2. A customer could set business_account_id to a business they don't
--    belong to, injecting their shipment into that business's history and
--    billing (business members can read business-tagged shipments).
-- 3. A Manager's session could set any profile's role to 'manager'. The
--    spec says managers cannot create managers except via a separate
--    super-admin mechanism — so from a client session, the manager role
--    can be neither granted nor revoked. That's a DB-console /
--    service-role operation only.

-- ── 1. Only the ACTIVE rule prices new client-created bookings ───────────
create or replace function shipment_price_is_valid(p_distance_km numeric, p_pricing_rule_id uuid, p_price numeric, p_currency text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rule pricing_rules%rowtype;
  expected numeric(10, 2);
begin
  select * into rule from pricing_rules where id = p_pricing_rule_id and is_active;
  if not found then
    return false;
  end if;

  expected := round(rule.base_price + greatest(p_distance_km - rule.base_distance_km, 0) * rule.additional_price_per_km, 2);
  return expected = round(p_price, 2) and rule.currency = p_currency;
end;
$$;

-- ── 2. Business tagging requires membership (or staff) ───────────────────
create function enforce_shipment_business_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.business_account_id is null or current_user not in ('authenticated', 'anon') or is_staff() then
    return new;
  end if;

  if not exists (
    select 1 from business_account_members
    where business_account_id = new.business_account_id
      and profile_id = new.customer_id
  ) then
    raise exception 'Customer is not a member of this business account';
  end if;

  return new;
end;
$$;

create trigger shipments_enforce_business_membership
  before insert on shipments
  for each row execute function enforce_shipment_business_membership();

-- ── 3. The manager role can't be granted or revoked from a client session ─
-- SECURITY INVOKER (unlike the 0002 original) is essential: inside a
-- definer function current_user is the owner, so the client-session check
-- below would never fire.
create or replace function prevent_profile_privilege_escalation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trusted callers (service-role client, SECURITY DEFINER functions,
  -- migrations) aren't restricted here — that's how staff onboarding and
  -- any future super-admin tooling operate.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.role is distinct from old.role and ('manager' in (new.role, old.role)) then
    raise exception 'The manager role cannot be granted or revoked from the application';
  end if;

  if not is_manager() then
    if new.role is distinct from old.role then
      raise exception 'Only a manager can change a profile''s role';
    end if;
    if new.active is distinct from old.active then
      raise exception 'Only a manager can activate or deactivate a profile';
    end if;
  end if;

  return new;
end;
$$;
