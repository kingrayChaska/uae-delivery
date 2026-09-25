-- Business customers, separate from individual customers (spec section 30).
-- A business account can have several member profiles (all role='customer')
-- who can create shipments/see billing on the business's behalf.
create table business_accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text not null,
  contact_email text not null,
  contact_phone text not null,
  billing_info jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_accounts_set_updated_at
  before update on business_accounts
  for each row execute function set_updated_at();

create table business_account_members (
  business_account_id uuid not null references business_accounts (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (business_account_id, profile_id)
);

alter table business_accounts enable row level security;
alter table business_account_members enable row level security;

-- A member can see their own business account; staff can see all (needed
-- to onboard businesses and support them operationally).
create policy business_accounts_select on business_accounts
  for select
  using (
    is_staff()
    or id in (select business_account_id from business_account_members where profile_id = auth.uid())
  );

-- Onboarding a business account is a staff task (spec doesn't give
-- customers a self-serve "become a business" flow).
create policy business_accounts_insert on business_accounts for insert with check (is_staff());
create policy business_accounts_update on business_accounts
  for update using (is_staff()) with check (is_staff());

create policy business_account_members_select on business_account_members
  for select
  using (is_staff() or profile_id = auth.uid());

create policy business_account_members_insert on business_account_members
  for insert with check (is_staff());

create policy business_account_members_delete on business_account_members
  for delete using (is_staff());
