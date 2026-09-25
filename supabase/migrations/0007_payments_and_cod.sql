-- payments: one row per payment ATTEMPT (not per shipment) so retries after
-- a failed card charge are visible in history rather than overwritten.
create table payments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id),
  customer_id uuid not null references profiles (id),
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'AED',
  method payment_method not null,
  status payment_status not null default 'pending',
  provider text,
  provider_payment_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_shipment_idx on payments (shipment_id);
create index payments_customer_idx on payments (customer_id);

create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

alter table payments enable row level security;

-- Customer sees own payments; staff see all (billing support, reconciliation,
-- reporting). Drivers have no reason to see card-payment records.
create policy payments_select on payments
  for select
  using (customer_id = auth.uid() or is_staff());

-- No INSERT/UPDATE policy for 'authenticated' at all. Payments are created
-- and transitioned only by server actions/webhooks using the service-role
-- client, after the server has independently computed the amount from
-- shipments + the active pricing_rules row — never from a client-supplied
-- amount. This is the "never trust client-side... payment status" rule
-- (spec section 44) applied literally: there is no code path in the
-- database itself that lets a browser session write this table.

-- cod_transactions: cash-on-delivery tracking per shipment.
create table cod_transactions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id),
  driver_id uuid not null references profiles (id),
  customer_id uuid not null references profiles (id),
  amount numeric(10, 2) not null check (amount >= 0),
  status cod_status not null default 'expected',
  collected_at timestamptz,
  reconciled_by uuid references profiles (id),
  reconciled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cod_transactions_shipment_idx on cod_transactions (shipment_id);
create index cod_transactions_driver_idx on cod_transactions (driver_id);
create index cod_transactions_status_idx on cod_transactions (status);

create trigger cod_transactions_set_updated_at
  before update on cod_transactions
  for each row execute function set_updated_at();

alter table cod_transactions enable row level security;

-- Driver sees own collections; staff see all (COD reconciliation/remittance
-- across the whole fleet).
create policy cod_transactions_select on cod_transactions
  for select
  using (driver_id = auth.uid() or is_staff());

-- The "expected" row is created server-side when a COD shipment is
-- confirmed (staff/service-role context) — a driver never creates their
-- own COD record, only updates it to mark collection (below).
create policy cod_transactions_insert on cod_transactions for insert with check (is_staff());

-- A driver may mark their own collection as collected; only staff can
-- reconcile/remit. Enforced with a tampering-guard trigger since RLS can't
-- compare OLD vs NEW per-column.
create policy cod_transactions_update on cod_transactions
  for update
  using (driver_id = auth.uid() or is_staff())
  with check (driver_id = auth.uid() or is_staff());

create function prevent_cod_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    if new.status not in ('collected')
      or old.status <> 'expected'
      or new.reconciled_by is distinct from old.reconciled_by
      or new.reconciled_at is distinct from old.reconciled_at
      or new.amount is distinct from old.amount
    then
      raise exception 'A driver may only mark their own expected COD as collected';
    end if;
  end if;
  return new;
end;
$$;

create trigger cod_transactions_prevent_tampering
  before update on cod_transactions
  for each row execute function prevent_cod_tampering();
