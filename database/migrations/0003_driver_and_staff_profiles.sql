-- Postgres CHECK constraints can't subquery other tables, so role
-- consistency (a driver_profiles row must point at a profile with
-- role='driver', staff_profiles at 'operator'/'manager') is enforced with
-- this trigger function instead, attached to each table below.
create function assert_profile_has_role(target_profile_id uuid, expected_roles user_role[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actual_role user_role;
begin
  select role into actual_role from profiles where id = target_profile_id;
  if actual_role is null or not (actual_role = any (expected_roles)) then
    raise exception 'profile % does not have one of the required roles: %', target_profile_id, expected_roles;
  end if;
end;
$$;

-- Vehicles exist independently of drivers so a Manager can register a
-- vehicle before assigning it, and reassign it later without losing history.
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_type text not null,
  make text not null,
  model text not null,
  plate_number text not null unique,
  registration_number text not null,
  registration_expiry date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vehicles_set_updated_at
  before update on vehicles
  for each row execute function set_updated_at();

-- driver_profiles: DRIVER-only fields, one row per driver profile.
create table driver_profiles (
  profile_id uuid primary key references profiles (id) on delete cascade,
  driver_code text not null unique,
  vehicle_id uuid references vehicles (id),
  license_number text not null,
  license_expiry date,
  availability driver_availability not null default 'offline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index driver_profiles_availability_idx on driver_profiles (availability);

create function check_driver_profiles_role()
returns trigger
language plpgsql
as $$
begin
  perform assert_profile_has_role(new.profile_id, array['driver']::user_role[]);
  return new;
end;
$$;

create trigger driver_profiles_check_role
  before insert on driver_profiles
  for each row execute function check_driver_profiles_role();

create trigger driver_profiles_set_updated_at
  before update on driver_profiles
  for each row execute function set_updated_at();

create function prevent_driver_profile_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    if new.driver_code is distinct from old.driver_code
      or new.vehicle_id is distinct from old.vehicle_id
      or new.license_number is distinct from old.license_number
      or new.license_expiry is distinct from old.license_expiry
    then
      raise exception 'Only a manager can change driver_code, vehicle_id or license fields';
    end if;
  end if;
  return new;
end;
$$;

create trigger driver_profiles_prevent_tampering
  before update on driver_profiles
  for each row execute function prevent_driver_profile_tampering();

-- staff_profiles: OPERATOR and MANAGER-only fields (employee ID). Kept
-- separate from driver_profiles rather than one big nullable "staff" table,
-- since the two roles' fields don't overlap.
create table staff_profiles (
  profile_id uuid primary key references profiles (id) on delete cascade,
  employee_id text not null unique,
  department text,
  created_at timestamptz not null default now()
);

create function check_staff_profiles_role()
returns trigger
language plpgsql
as $$
begin
  perform assert_profile_has_role(new.profile_id, array['operator', 'manager']::user_role[]);
  return new;
end;
$$;

create trigger staff_profiles_check_role
  before insert on staff_profiles
  for each row execute function check_staff_profiles_role();

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Enabled here, after all three tables exist, so vehicles_select can
-- reference driver_profiles.

alter table vehicles enable row level security;

create policy vehicles_select on vehicles
  for select
  using (is_staff() or id in (select vehicle_id from driver_profiles where profile_id = auth.uid()));

-- Vehicle records are a management concern — only a Manager registers or
-- edits them (Operators dispatch drivers, they don't manage fleet assets).
create policy vehicles_insert on vehicles for insert with check (is_manager());
create policy vehicles_update on vehicles for update using (is_manager()) with check (is_manager());

alter table driver_profiles enable row level security;

-- Self can see own row; staff need to see every driver for dispatch/management;
-- everyone else (customers, other drivers) has no visibility into driver
-- profiles at all.
create policy driver_profiles_select on driver_profiles
  for select
  using (profile_id = auth.uid() or is_staff());

-- Only a Manager creates the driver_profiles row (part of onboarding a new
-- driver, alongside promoting profiles.role to 'driver').
create policy driver_profiles_insert on driver_profiles for insert with check (is_manager());

-- A driver may only flip their own availability day-to-day; every other
-- field (driver_code, vehicle_id, license) is Manager-only. Enforced above
-- with a trigger, since RLS can't compare OLD vs NEW columns individually.
create policy driver_profiles_update on driver_profiles
  for update
  using (profile_id = auth.uid() or is_manager())
  with check (profile_id = auth.uid() or is_manager());

alter table staff_profiles enable row level security;

create policy staff_profiles_select on staff_profiles
  for select
  using (profile_id = auth.uid() or is_staff());

-- Only a Manager creates staff accounts (Operators cannot create Operator
-- or Manager accounts — see spec section 22 "Operators CANNOT... Create
-- Operator accounts").
create policy staff_profiles_insert on staff_profiles for insert with check (is_manager());
create policy staff_profiles_update on staff_profiles
  for update using (is_manager()) with check (is_manager());
