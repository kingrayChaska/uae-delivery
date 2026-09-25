-- profiles: one row per auth.users row. Base identity + role for every
-- CUSTOMER / DRIVER / OPERATOR / MANAGER. Role-specific fields live in
-- driver_profiles / staff_profiles below rather than as nullable columns here.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'customer',
  full_name text not null,
  email text not null,
  phone text not null,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles (role);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Role-helper functions used throughout every RLS policy in this schema.
-- SECURITY DEFINER + a fixed search_path so they read `profiles` directly
-- without recursing back into profiles' own RLS policies (which call
-- these same functions). These are the ONLY place "what role is the
-- caller" is decided for policy purposes — never a client-supplied value.
create function current_app_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_app_role() in ('operator', 'manager');
$$;

create function is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_app_role() = 'manager';
$$;

alter table profiles enable row level security;

-- Self can see own profile; staff can see everyone (needed for dispatch,
-- staff management, customer support).
create policy profiles_select on profiles
  for select
  using (id = auth.uid() or is_staff());

-- No INSERT policy for the 'authenticated' role at all: every profile row
-- is created either by the handle_new_user trigger below (self-registration,
-- always role='customer') or by a Manager-only server action using the
-- service-role client (staff onboarding), which bypasses RLS entirely.
-- This is deliberate — it's what stops a signup request from ever choosing
-- its own role.

-- Self can update own profile (display fields only); Manager can update any.
-- Non-privileged-field enforcement (role/active can't be self-changed) is
-- done in the trigger below, not here — RLS alone can't compare OLD vs NEW.
create policy profiles_update on profiles
  for update
  using (id = auth.uid() or is_manager())
  with check (id = auth.uid() or is_manager());

-- No DELETE policy anywhere: profiles are deactivated (active=false), never
-- deleted, so shipment/payment history keeps a valid foreign key.

-- Blocks a non-Manager from changing their own role or active status, even
-- though profiles_update would otherwise allow the row-level update.
create function prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

create trigger profiles_prevent_privilege_escalation
  before update on profiles
  for each row execute function prevent_profile_privilege_escalation();

-- Creates the profile row on every new auth.users signup. Role is ALWAYS
-- 'customer' here, regardless of anything in raw_user_meta_data — self-serve
-- signup can never grant itself driver/operator/manager. Staff accounts are
-- created by a Manager-only server action that calls supabase.auth.admin
-- .createUser() (which fires this same trigger, inserting role='customer')
-- and then immediately promotes the row via the service-role client in the
-- same server action — see lib/auth and the Manager staff-management phase.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
