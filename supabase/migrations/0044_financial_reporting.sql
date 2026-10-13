-- Financial reporting: merchant account statements, operating expenses and
-- the business performance report.
--
-- Nothing here creates a second copy of a financial fact. Every amount is
-- read from the records that already hold it:
--
--   ParcelLink's charge      shipments.price — the price-checked amount
--                            stored at booking (0022), never re-priced here.
--   Goods money (COD)        cod_transactions.product_amount on rows whose
--                            collection was VERIFIED (collected_amount set
--                            by the 0042 trigger). Rows collected before
--                            0042 have no verified amount: they are shown as
--                            "unverified" and left out of every total.
--   Fee already paid         cod_transactions.delivery_fee_amount on verified
--                            rows (the sender paid the delivery fee in cash)
--                            and payments with status 'paid' (card). Credited
--                            on the statement, so a fee already paid is never
--                            charged a second time.
--   COD already paid out     product_amount on verified rows marked
--                            'remitted' (paid out to the merchant).
--   When it happened         shipment_status_history: the 'delivered' row
--                            (terminal, never corrected — 0041) or the latest
--                            'returned' row (a manager can re-open a return).
--                            Booking date is never used as a delivery date.
--
-- Periods are calendar days in Asia/Dubai, the convention of invoices (0031)
-- and driver cash (0042).
--
-- 1. financial_policy() — the two rates the business asked for:
--      return charge  = 50 % of the original delivery service cost
--      cash handling  = 1.5 % of verified COD goods money collected
--    Both are copied onto each statement, so a later change of rate never
--    alters a statement already issued.
--
-- 2. financial_shipment_lines() — THE calculation engine. One row per
--    shipment completed (delivered or returned) in a period, with every
--    amount aggregated per shipment BEFORE joining (no join can multiply a
--    row). Merchant statements and the performance report both read it.
--
-- 3. merchant_statements + merchant_statement_lines — immutable snapshots,
--    following the invoice pattern (0031). draft → published → superseded.
--    A draft is a manager-only preview (it can be discarded); publishing is
--    an explicit step that makes it visible to the merchant; a correction is
--    a new statement that supersedes the old one, which stays on record.
--    Written only by the SECURITY DEFINER functions below.
--
-- 4. expense_categories + expenses — managers only. Categories belong to a
--    profit group (fuel / subscription / salary / rent / other) so the four
--    stepwise profit figures work for categories added later. Expenses are
--    never deleted: they are voided with a reason. Every change is audited.
--
-- 5. business_performance_summary() / expense_category_totals() — revenue,
--    expenditure, the four cumulative profit figures, net operating profit
--    and the break-even gap, all in numeric (no floating point).

-- ── 1. Policy ────────────────────────────────────────────────────────────
create function financial_policy()
returns table (return_charge_rate numeric, cash_handling_rate numeric)
language sql
immutable
set search_path = public
as $$
  select 0.50::numeric(6, 4), 0.0150::numeric(6, 4);
$$;

revoke execute on function financial_policy() from public, anon;
grant execute on function financial_policy() to authenticated;

-- Period scans start from completion events, not from every shipment.
create index shipment_status_history_completion_idx
  on shipment_status_history (created_at)
  where status in ('delivered', 'returned');

-- ── 2. The calculation engine ────────────────────────────────────────────
-- Per shipment (amounts in AED, numeric(12,2)):
--   service_charge      delivered: price. returned: 0.
--   return_charge       returned merchant shipment: round(rate × (price −
--                       cod_charge), 2) — the original delivery service
--                       (base + distance + weight) without the COD fee,
--                       because no cash was handled. Individuals: 0.
--   cod_collected       verified goods money collected.
--   cod_unverified      goods money marked collected before 0042 (excluded).
--   cod_uncollected     a delivered postpaid shipment with no collection
--                       record at all (excluded; shown as a warning).
--   cash_handling_fee   round(cod_collected × rate, 2) — merchants only.
--   payments_received   verified cash delivery fee + paid card payments.
--   fees_unverified     cash fee marked collected before 0042 (excluded).
--   cod_remitted        verified goods money already paid out.
-- Manager only: anyone else gets no rows.
create function financial_shipment_lines(p_from date, p_to date, p_business_account_id uuid default null)
returns table (
  shipment_id uuid,
  business_account_id uuid,
  is_merchant boolean,
  tracking_number text,
  event text,
  event_at timestamptz,
  recipient_name text,
  delivery_type delivery_type,
  payment_method payment_method,
  recipient_payment_type recipient_payment_type,
  currency text,
  price numeric,
  service_charge numeric,
  return_charge numeric,
  cod_collected numeric,
  cod_unverified numeric,
  cod_uncollected numeric,
  cash_handling_fee numeric,
  payments_received numeric,
  fees_unverified numeric,
  cod_remitted numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (p_from::timestamp at time zone 'Asia/Dubai') as from_ts,
      ((p_to + 1)::timestamp at time zone 'Asia/Dubai') as to_ts
  ),
  policy as (select * from financial_policy()),
  candidates as (
    select distinct h.shipment_id
    from shipment_status_history h, bounds b
    where h.status in ('delivered', 'returned')
      and h.created_at >= b.from_ts and h.created_at < b.to_ts
  ),
  ev as (
    -- The shipment's CURRENT outcome and when it last reached it; a
    -- returned shipment re-opened and returned again counts once, at the
    -- latest return.
    select
      s.id,
      s.status::text as event,
      (select max(h.created_at) from shipment_status_history h where h.shipment_id = s.id and h.status = s.status) as event_at
    from shipments s
    join candidates c on c.shipment_id = s.id
    where s.status in ('delivered', 'returned')
      and (p_business_account_id is null or s.business_account_id = p_business_account_id)
  ),
  cod as (
    select
      c.shipment_id,
      coalesce(sum(c.product_amount) filter (where c.collected_amount is not null and c.status in ('collected', 'reconciled', 'remitted')), 0) as goods_verified,
      coalesce(sum(c.product_amount) filter (where c.collected_amount is null and c.status in ('collected', 'reconciled', 'remitted')), 0) as goods_unverified,
      coalesce(sum(c.delivery_fee_amount) filter (where c.collected_amount is not null and c.status in ('collected', 'reconciled', 'remitted')), 0) as fee_verified,
      coalesce(sum(c.delivery_fee_amount) filter (where c.collected_amount is null and c.status in ('collected', 'reconciled', 'remitted')), 0) as fee_unverified,
      coalesce(sum(c.product_amount) filter (where c.collected_amount is not null and c.status = 'remitted'), 0) as goods_remitted,
      count(*) filter (where c.status in ('collected', 'reconciled', 'remitted')) as collections
    from cod_transactions c
    where c.shipment_id in (select id from ev)
    group by c.shipment_id
  ),
  pay as (
    select p.shipment_id, coalesce(sum(p.amount) filter (where p.status = 'paid'), 0) as paid
    from payments p
    where p.shipment_id in (select id from ev)
    group by p.shipment_id
  ),
  lines as (
    select
      s.id as shipment_id,
      s.business_account_id,
      s.business_account_id is not null as is_merchant,
      s.tracking_number,
      ev.event,
      ev.event_at,
      s.dropoff_contact_name as recipient_name,
      s.delivery_type,
      s.payment_method,
      s.recipient_payment_type,
      s.currency,
      s.price::numeric(12, 2) as price,
      case when ev.event = 'delivered' then s.price else 0 end::numeric(12, 2) as service_charge,
      case
        when ev.event = 'returned' and s.business_account_id is not null
          then round(greatest(s.price - coalesce(s.cod_charge, 0), 0) * pol.return_charge_rate, 2)
        else 0
      end::numeric(12, 2) as return_charge,
      coalesce(cod.goods_verified, 0)::numeric(12, 2) as cod_collected,
      coalesce(cod.goods_unverified, 0)::numeric(12, 2) as cod_unverified,
      case
        when ev.event = 'delivered' and s.recipient_payment_type = 'postpaid' and s.cod_amount > 0
          and coalesce(cod.collections, 0) = 0
          then s.cod_amount
        else 0
      end::numeric(12, 2) as cod_uncollected,
      case
        when s.business_account_id is not null then round(coalesce(cod.goods_verified, 0) * pol.cash_handling_rate, 2)
        else 0
      end::numeric(12, 2) as cash_handling_fee,
      (coalesce(cod.fee_verified, 0) + coalesce(pay.paid, 0))::numeric(12, 2) as payments_received,
      coalesce(cod.fee_unverified, 0)::numeric(12, 2) as fees_unverified,
      coalesce(cod.goods_remitted, 0)::numeric(12, 2) as cod_remitted
    from ev
    join shipments s on s.id = ev.id
    cross join bounds b
    cross join policy pol
    left join cod on cod.shipment_id = s.id
    left join pay on pay.shipment_id = s.id
    where ev.event_at >= b.from_ts and ev.event_at < b.to_ts
  )
  select * from lines
  where (select is_manager())
  order by event_at, tracking_number;
$$;

revoke execute on function financial_shipment_lines(date, date, uuid) from public, anon;
grant execute on function financial_shipment_lines(date, date, uuid) to authenticated;

-- ── 3. Merchant statements ───────────────────────────────────────────────
-- STM-2026-000123, assigned when a statement is PUBLISHED (drafts have no
-- number), so the sequence of issued statements has no gaps.
create sequence merchant_statement_number_seq;

create function next_merchant_statement_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'STM-' || to_char(now() at time zone 'Asia/Dubai', 'YYYY') || '-' || lpad(nextval('merchant_statement_number_seq')::text, 6, '0');
$$;

revoke execute on function next_merchant_statement_number() from public, anon, authenticated;

create table merchant_statements (
  id uuid primary key default gen_random_uuid(),
  statement_number text unique,
  business_account_id uuid not null references business_accounts (id),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded')),
  version integer not null default 1 check (version >= 1),
  -- A correction: the published statement this one replaces, and why.
  supersedes_id uuid references merchant_statements (id),
  correction_reason text check (correction_reason is null or char_length(correction_reason) between 5 and 500),
  -- Who the statement is addressed to, as it was when generated.
  merchant jsonb not null check (jsonb_typeof(merchant) = 'object'),
  currency text not null default 'AED' check (currency = 'AED'),
  return_charge_rate numeric(6, 4) not null,
  cash_handling_rate numeric(6, 4) not null,
  line_count integer not null check (line_count >= 1),
  delivered_count integer not null check (delivered_count >= 0),
  returned_count integer not null check (returned_count >= 0),
  total_cod numeric(12, 2) not null check (total_cod >= 0),
  cod_already_remitted numeric(12, 2) not null check (cod_already_remitted >= 0),
  service_charges numeric(12, 2) not null check (service_charges >= 0),
  return_charges numeric(12, 2) not null check (return_charges >= 0),
  cash_handling_base numeric(12, 2) not null check (cash_handling_base >= 0),
  cash_handling_fee numeric(12, 2) not null check (cash_handling_fee >= 0),
  payments_received numeric(12, 2) not null check (payments_received >= 0),
  -- Positive: ParcelLink pays the merchant. Negative: the merchant owes
  -- ParcelLink. Equal to the formula below, enforced.
  net_amount numeric(12, 2) not null,
  outcome text not null check (outcome in ('payable_to_merchant', 'due_from_merchant', 'settled')),
  kind text not null check (kind in ('cod_remittance', 'service_charges')),
  -- Excluded from every total, shown so they can be followed up.
  cod_unverified numeric(12, 2) not null default 0 check (cod_unverified >= 0),
  cod_uncollected numeric(12, 2) not null default 0 check (cod_uncollected >= 0),
  fees_unverified numeric(12, 2) not null default 0 check (fees_unverified >= 0),
  generated_by uuid not null references profiles (id),
  generated_at timestamptz not null default now(),
  published_by uuid references profiles (id),
  published_at timestamptz,
  superseded_by_id uuid references merchant_statements (id),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_statements_period check (period_end >= period_start and period_end - period_start <= 365),
  constraint merchant_statements_net check (
    net_amount = total_cod - cod_already_remitted - service_charges - return_charges - cash_handling_fee + payments_received
  ),
  constraint merchant_statements_cash_handling_base check (cash_handling_base = total_cod),
  constraint merchant_statements_outcome check (
    (outcome = 'payable_to_merchant' and net_amount > 0)
    or (outcome = 'due_from_merchant' and net_amount < 0)
    or (outcome = 'settled' and net_amount = 0)
  ),
  constraint merchant_statements_kind check ((kind = 'cod_remittance') = (total_cod > 0)),
  constraint merchant_statements_state check (
    (status = 'draft' and statement_number is null and published_at is null and superseded_at is null)
    or (status = 'published' and statement_number is not null and published_by is not null and published_at is not null and superseded_at is null)
    or (status = 'superseded' and statement_number is not null and published_at is not null and superseded_at is not null and superseded_by_id is not null)
  ),
  constraint merchant_statements_correction check ((supersedes_id is null) = (correction_reason is null))
);

create index merchant_statements_business_idx on merchant_statements (business_account_id, period_start desc);
create index merchant_statements_status_idx on merchant_statements (status, generated_at desc);

create trigger merchant_statements_set_updated_at
  before update on merchant_statements
  for each row execute function set_updated_at();

create table merchant_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references merchant_statements (id) on delete cascade,
  line_number integer not null check (line_number >= 1),
  shipment_id uuid not null references shipments (id),
  tracking_number text not null,
  event text not null check (event in ('delivered', 'returned')),
  event_at timestamptz not null,
  recipient_name text not null,
  delivery_type delivery_type,
  payment_method payment_method not null,
  recipient_payment_type recipient_payment_type not null,
  price numeric(12, 2) not null,
  service_charge numeric(12, 2) not null check (service_charge >= 0),
  return_charge numeric(12, 2) not null check (return_charge >= 0),
  cod_collected numeric(12, 2) not null check (cod_collected >= 0),
  cod_unverified numeric(12, 2) not null check (cod_unverified >= 0),
  cod_uncollected numeric(12, 2) not null check (cod_uncollected >= 0),
  cash_handling_fee numeric(12, 2) not null check (cash_handling_fee >= 0),
  payments_received numeric(12, 2) not null check (payments_received >= 0),
  fees_unverified numeric(12, 2) not null check (fees_unverified >= 0),
  cod_remitted numeric(12, 2) not null check (cod_remitted >= 0),
  currency text not null,
  unique (statement_id, line_number),
  -- A shipment appears once per statement.
  unique (statement_id, shipment_id)
);

create index merchant_statement_lines_shipment_idx on merchant_statement_lines (shipment_id);

-- ── Immutability ─────────────────────────────────────────────────────────
-- Every caller, the service role included. A draft may be deleted
-- (discarded) or published; a published statement may only be superseded;
-- nothing else ever changes.
create function enforce_merchant_statement_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_frozen text[] := array['status', 'statement_number', 'published_by', 'published_at', 'superseded_by_id', 'superseded_at', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Published statements cannot be changed';
    end if;
    return old;
  end if;

  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    raise exception 'Published statements cannot be changed';
  end if;

  if not (
    (old.status = 'draft' and new.status = 'published')
    or (old.status = 'published' and new.status = 'superseded'
        and new.statement_number = old.statement_number
        and new.published_by = old.published_by and new.published_at = old.published_at)
  ) then
    raise exception 'Published statements cannot be changed';
  end if;

  return new;
end;
$$;

revoke execute on function enforce_merchant_statement_immutability() from public, anon, authenticated;

create trigger merchant_statements_immutable
  before update or delete on merchant_statements
  for each row execute function enforce_merchant_statement_immutability();

create function enforce_merchant_statement_line_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Only as part of discarding a draft (the parent is deleted first, by
    -- cascade, so it is no longer visible here — or it is still a draft).
    if exists (select 1 from merchant_statements where id = old.statement_id and status <> 'draft') then
      raise exception 'Published statements cannot be changed';
    end if;
    return old;
  end if;
  raise exception 'Published statements cannot be changed';
end;
$$;

revoke execute on function enforce_merchant_statement_line_immutability() from public, anon, authenticated;

create trigger merchant_statement_lines_immutable
  before update or delete on merchant_statement_lines
  for each row execute function enforce_merchant_statement_line_immutability();

-- ── Row Level Security ───────────────────────────────────────────────────
alter table merchant_statements enable row level security;
alter table merchant_statement_lines enable row level security;

-- Managers see everything, drafts included. A merchant sees only the
-- statements PUBLISHED to a business account they belong to (and the ones
-- those replaced) — never a draft, never another merchant's.
create policy merchant_statements_select on merchant_statements
  for select
  using (
    (select is_manager())
    or (
      status in ('published', 'superseded')
      and business_account_id in (
        select business_account_id from business_account_members where profile_id = (select auth.uid())
      )
    )
  );

-- Lines follow their statement (the subquery runs under the policy above).
create policy merchant_statement_lines_select on merchant_statement_lines
  for select
  using (statement_id in (select id from merchant_statements));

-- No write policies: only the functions below write these tables.
revoke all on merchant_statements, merchant_statement_lines from anon;
revoke insert, update, delete on merchant_statements, merchant_statement_lines from authenticated;

-- ── Generating, publishing, discarding ───────────────────────────────────
create function require_statement_manager()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'manager' and active and deleted_at is null
  ) then
    raise exception 'Only a manager can manage merchant statements';
  end if;
end;
$$;

revoke execute on function require_statement_manager() from public, anon, authenticated;

-- Raises when a live (published) statement of this merchant overlaps the
-- period, other than the one being corrected.
create function assert_no_statement_overlap(p_business_account_id uuid, p_from date, p_to date, p_except uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from merchant_statements
    where business_account_id = p_business_account_id
      and status = 'published'
      and id is distinct from p_except
      and period_start <= p_to and period_end >= p_from
  ) then
    raise exception 'A published statement already covers part of this period';
  end if;
end;
$$;

revoke execute on function assert_no_statement_overlap(uuid, date, date, uuid) from public, anon, authenticated;

-- Builds a DRAFT statement from financial_shipment_lines() and returns its
-- id. A draft is visible to managers only. With p_supersedes, it is a
-- correction of that published statement: same merchant, same period, and
-- a reason is required.
create function generate_merchant_statement(
  p_business_account_id uuid,
  p_from date,
  p_to date,
  p_supersedes uuid default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_business business_accounts%rowtype;
  v_old merchant_statements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_policy record;
  v_id uuid := gen_random_uuid();
  v_totals record;
  v_net numeric(12, 2);
  v_merchant jsonb;
  v_holder uuid;
begin
  perform require_statement_manager();

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a valid reporting period';
  end if;
  if p_to - p_from > 365 then
    raise exception 'A reporting period can be at most 366 days';
  end if;
  if p_to > (now() at time zone 'Asia/Dubai')::date then
    raise exception 'A reporting period can''t end in the future';
  end if;

  select * into v_business from business_accounts where id = p_business_account_id;
  if not found then
    raise exception 'Merchant not found';
  end if;

  -- One statement change per merchant at a time.
  perform pg_advisory_xact_lock(hashtextextended('merchant_statement:' || p_business_account_id::text, 0));

  if p_supersedes is not null then
    select * into v_old from merchant_statements where id = p_supersedes;
    if not found or v_old.business_account_id <> p_business_account_id then
      raise exception 'Statement not found';
    end if;
    if v_old.status <> 'published' then
      raise exception 'Only a published statement can be corrected';
    end if;
    if v_old.period_start <> p_from or v_old.period_end <> p_to then
      raise exception 'A correction covers the same period as the statement it replaces';
    end if;
    if v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then
      raise exception 'Give a reason for the correction (5 to 500 characters)';
    end if;
  elsif v_reason is not null then
    v_reason := null;
  end if;

  perform assert_no_statement_overlap(p_business_account_id, p_from, p_to, p_supersedes);

  drop table if exists statement_lines_tmp;
  create temporary table statement_lines_tmp on commit drop as
  select * from financial_shipment_lines(p_from, p_to, p_business_account_id);

  select
    count(*)::integer as line_count,
    count(*) filter (where event = 'delivered')::integer as delivered_count,
    count(*) filter (where event = 'returned')::integer as returned_count,
    coalesce(sum(cod_collected), 0)::numeric(12, 2) as total_cod,
    coalesce(sum(cod_remitted), 0)::numeric(12, 2) as cod_remitted,
    coalesce(sum(service_charge), 0)::numeric(12, 2) as service_charges,
    coalesce(sum(return_charge), 0)::numeric(12, 2) as return_charges,
    coalesce(sum(cash_handling_fee), 0)::numeric(12, 2) as cash_handling_fee,
    coalesce(sum(payments_received), 0)::numeric(12, 2) as payments_received,
    coalesce(sum(cod_unverified), 0)::numeric(12, 2) as cod_unverified,
    coalesce(sum(cod_uncollected), 0)::numeric(12, 2) as cod_uncollected,
    coalesce(sum(fees_unverified), 0)::numeric(12, 2) as fees_unverified,
    count(distinct currency)::integer as currencies
  into v_totals
  from statement_lines_tmp;

  if v_totals.line_count = 0 then
    raise exception 'There are no completed deliveries or returns in this period';
  end if;
  if v_totals.currencies > 1 or exists (select 1 from statement_lines_tmp where currency <> 'AED') then
    raise exception 'This statement mixes currencies and cannot be generated';
  end if;

  v_net := v_totals.total_cod - v_totals.cod_remitted - v_totals.service_charges - v_totals.return_charges
    - v_totals.cash_handling_fee + v_totals.payments_received;

  select * into v_policy from financial_policy();

  select m.profile_id into v_holder
  from business_account_members m where m.business_account_id = p_business_account_id
  order by m.added_at limit 1;

  v_merchant := jsonb_strip_nulls(jsonb_build_object(
    'name', v_business.company_name,
    'accountId', v_business.id,
    'contactPerson', nullif(v_business.contact_person, ''),
    'email', nullif(v_business.contact_email, ''),
    'phone', nullif(v_business.contact_phone, ''),
    'address', nullif(v_business.billing_info ->> 'address', ''),
    'city', nullif(v_business.billing_info ->> 'city', ''),
    'country', nullif(v_business.billing_info ->> 'country', ''),
    'trn', nullif(v_business.billing_info ->> 'trn', ''),
    'registrationNumber', nullif(v_business.billing_info ->> 'registration_number', ''),
    'licenseNumber', nullif(v_business.billing_info ->> 'license_number', '')
  ));

  insert into merchant_statements (
    id, business_account_id, period_start, period_end, status, version, supersedes_id, correction_reason,
    merchant, currency, return_charge_rate, cash_handling_rate,
    line_count, delivered_count, returned_count,
    total_cod, cod_already_remitted, service_charges, return_charges, cash_handling_base, cash_handling_fee,
    payments_received, net_amount, outcome, kind, cod_unverified, cod_uncollected, fees_unverified, generated_by
  ) values (
    v_id, p_business_account_id, p_from, p_to, 'draft',
    case when p_supersedes is null then 1 else v_old.version + 1 end,
    p_supersedes, v_reason,
    v_merchant, 'AED', v_policy.return_charge_rate, v_policy.cash_handling_rate,
    v_totals.line_count, v_totals.delivered_count, v_totals.returned_count,
    v_totals.total_cod, v_totals.cod_remitted, v_totals.service_charges, v_totals.return_charges,
    v_totals.total_cod, v_totals.cash_handling_fee, v_totals.payments_received, v_net,
    case when v_net > 0 then 'payable_to_merchant' when v_net < 0 then 'due_from_merchant' else 'settled' end,
    case when v_totals.total_cod > 0 then 'cod_remittance' else 'service_charges' end,
    v_totals.cod_unverified, v_totals.cod_uncollected, v_totals.fees_unverified, v_actor
  );

  insert into merchant_statement_lines (
    statement_id, line_number, shipment_id, tracking_number, event, event_at, recipient_name, delivery_type,
    payment_method, recipient_payment_type, price, service_charge, return_charge, cod_collected, cod_unverified,
    cod_uncollected, cash_handling_fee, payments_received, fees_unverified, cod_remitted, currency
  )
  select
    v_id, row_number() over (order by l.event_at, l.tracking_number), l.shipment_id, l.tracking_number, l.event, l.event_at,
    l.recipient_name, l.delivery_type, l.payment_method, l.recipient_payment_type, l.price, l.service_charge,
    l.return_charge, l.cod_collected, l.cod_unverified, l.cod_uncollected, l.cash_handling_fee, l.payments_received,
    l.fees_unverified, l.cod_remitted, l.currency
  from statement_lines_tmp l;

  -- Belt and braces: the header must equal its lines.
  if (select coalesce(sum(cod_collected - cod_remitted - service_charge - return_charge - cash_handling_fee + payments_received), 0)
      from merchant_statement_lines where statement_id = v_id) <> v_net then
    raise exception 'Statement total does not match its lines';
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (v_actor, 'statement.generated', 'merchant_statement', v_id,
    jsonb_build_object('businessAccountId', p_business_account_id, 'from', p_from, 'to', p_to,
      'netAmount', v_net, 'lines', v_totals.line_count, 'supersedes', p_supersedes, 'reason', v_reason));

  return v_id;
end;
$$;

revoke execute on function generate_merchant_statement(uuid, date, date, uuid, text) from public, anon;
grant execute on function generate_merchant_statement(uuid, date, date, uuid, text) to authenticated;

-- Makes a draft visible to the merchant: assigns its number, supersedes the
-- statement it corrects, and tells the merchant's members in-app.
create function publish_merchant_statement(p_statement_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_statement merchant_statements%rowtype;
  v_number text;
begin
  perform require_statement_manager();

  select * into v_statement from merchant_statements where id = p_statement_id;
  if not found then
    raise exception 'Statement not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('merchant_statement:' || v_statement.business_account_id::text, 0));
  select * into v_statement from merchant_statements where id = p_statement_id for update;

  if v_statement.status <> 'draft' then
    -- A repeated click returns the number already assigned.
    if v_statement.status = 'published' then
      return v_statement.statement_number;
    end if;
    raise exception 'Only a draft statement can be published';
  end if;

  if v_statement.supersedes_id is not null
    and not exists (select 1 from merchant_statements where id = v_statement.supersedes_id and status = 'published') then
    raise exception 'The statement this corrects has already been replaced';
  end if;

  perform assert_no_statement_overlap(v_statement.business_account_id, v_statement.period_start, v_statement.period_end, v_statement.supersedes_id);

  -- The same completion of a shipment is never billed on two live statements.
  if exists (
    select 1
    from merchant_statement_lines mine
    join merchant_statement_lines other on other.shipment_id = mine.shipment_id
      and other.event = mine.event and other.event_at = mine.event_at
    join merchant_statements os on os.id = other.statement_id
    where mine.statement_id = p_statement_id
      and os.status = 'published'
      and os.id <> p_statement_id
      and os.id is distinct from v_statement.supersedes_id
  ) then
    raise exception 'A shipment on this statement is already on another published statement';
  end if;

  v_number := next_merchant_statement_number();

  update merchant_statements
  set status = 'published', statement_number = v_number, published_by = v_actor, published_at = now()
  where id = p_statement_id;

  if v_statement.supersedes_id is not null then
    update merchant_statements
    set status = 'superseded', superseded_by_id = p_statement_id, superseded_at = now()
    where id = v_statement.supersedes_id;
  end if;

  insert into notifications (profile_id, type, title, body, data)
  select m.profile_id, 'statement.published', 'Account statement available',
    'Statement ' || v_number || ' is ready in Account Reports.',
    jsonb_build_object('statementId', p_statement_id)
  from business_account_members m
  join profiles p on p.id = m.profile_id and p.active and p.deleted_at is null
  where m.business_account_id = v_statement.business_account_id;

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (v_actor, 'statement.published', 'merchant_statement', p_statement_id,
    jsonb_build_object('statementNumber', v_number, 'businessAccountId', v_statement.business_account_id,
      'netAmount', v_statement.net_amount, 'supersedes', v_statement.supersedes_id));

  return v_number;
end;
$$;

revoke execute on function publish_merchant_statement(uuid) from public, anon;
grant execute on function publish_merchant_statement(uuid) to authenticated;

create function discard_merchant_statement(p_statement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statement merchant_statements%rowtype;
begin
  perform require_statement_manager();

  select * into v_statement from merchant_statements where id = p_statement_id for update;
  if not found then
    raise exception 'Statement not found';
  end if;
  if v_statement.status <> 'draft' then
    raise exception 'Only a draft statement can be discarded';
  end if;

  delete from merchant_statements where id = p_statement_id;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value)
  values (auth.uid(), 'statement.discarded', 'merchant_statement', p_statement_id,
    jsonb_build_object('businessAccountId', v_statement.business_account_id, 'from', v_statement.period_start,
      'to', v_statement.period_end, 'netAmount', v_statement.net_amount));
end;
$$;

revoke execute on function discard_merchant_statement(uuid) from public, anon;
grant execute on function discard_merchant_statement(uuid) to authenticated;

-- ── 4. Expenses ──────────────────────────────────────────────────────────
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  -- Which stepwise profit figure deducts it (business_performance_summary).
  profit_group text not null default 'other' check (profit_group in ('fuel', 'subscription', 'salary', 'rent', 'other')),
  -- The four starting categories: always present, name and group fixed.
  is_system boolean not null default false,
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "Fuel" and " fuel " are the same category.
create unique index expense_categories_name_unique on expense_categories (lower(btrim(name)));

create trigger expense_categories_set_updated_at
  before update on expense_categories
  for each row execute function set_updated_at();

insert into expense_categories (name, profit_group, is_system) values
  ('Salary', 'salary', true),
  ('Rent', 'rent', true),
  ('Fuel', 'fuel', true),
  ('Subscription', 'subscription', true);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references expense_categories (id),
  description text not null check (char_length(btrim(description)) between 2 and 200),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  currency text not null default 'AED' check (currency = 'AED'),
  -- The day the cost was incurred: what the performance report filters on.
  incurred_on date not null,
  payment_status text not null default 'paid' check (payment_status in ('unpaid', 'paid')),
  paid_on date,
  vendor text check (vendor is null or char_length(vendor) <= 120),
  reference text check (reference is null or char_length(reference) <= 100),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'active' check (status in ('active', 'void')),
  void_reason text check (void_reason is null or char_length(void_reason) between 5 and 500),
  voided_by uuid references profiles (id),
  voided_at timestamptz,
  created_by uuid not null references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_paid_on check (payment_status = 'paid' or paid_on is null),
  constraint expenses_void_state check (
    (status = 'active' and void_reason is null and voided_by is null and voided_at is null)
    or (status = 'void' and void_reason is not null and voided_by is not null and voided_at is not null)
  )
);

create index expenses_incurred_idx on expenses (incurred_on) where status = 'active';
create index expenses_category_idx on expenses (category_id);

create trigger expenses_set_updated_at
  before update on expenses
  for each row execute function set_updated_at();

-- Who changed what is taken from the session, never the request; an
-- expense is never deleted and a void one never changes again.
create function enforce_expense_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Expenses cannot be deleted. Void the expense instead.';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := null;
    if new.status <> 'active' then
      raise exception 'Void expenses cannot be changed';
    end if;
    return new;
  end if;

  if old.status = 'void' then
    raise exception 'Void expenses cannot be changed';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.status = 'void' then
    if nullif(btrim(coalesce(new.void_reason, '')), '') is null then
      raise exception 'Give a reason for voiding this expense';
    end if;
    new.voided_by := coalesce(auth.uid(), new.voided_by);
    new.voided_at := now();
    -- Voiding records the decision only; the figures stay as they were.
    if (to_jsonb(new) - array['status', 'void_reason', 'voided_by', 'voided_at', 'updated_by', 'updated_at'])
       is distinct from (to_jsonb(old) - array['status', 'void_reason', 'voided_by', 'voided_at', 'updated_by', 'updated_at']) then
      raise exception 'Void an expense without changing it';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function enforce_expense_rules() from public, anon, authenticated;

create trigger expenses_enforce_rules
  before insert or update or delete on expenses
  for each row execute function enforce_expense_rules();

create function enforce_expense_category_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Expense categories cannot be deleted. Deactivate the category instead.';
  end if;
  if tg_op = 'UPDATE' then
    if old.is_system and (
      new.name is distinct from old.name or new.profit_group is distinct from old.profit_group or not new.active
    ) then
      raise exception 'Built-in expense categories cannot be renamed, regrouped or deactivated';
    end if;
    if new.is_system is distinct from old.is_system then
      raise exception 'Built-in expense categories cannot be renamed, regrouped or deactivated';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  else
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.is_system and current_user in ('authenticated', 'anon') then
      raise exception 'Built-in expense categories cannot be renamed, regrouped or deactivated';
    end if;
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

revoke execute on function enforce_expense_category_rules() from public, anon, authenticated;

create trigger expense_categories_enforce_rules
  before insert or update or delete on expense_categories
  for each row execute function enforce_expense_category_rules();

-- Every insert and change, with the whole before/after row.
create function audit_finance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := '.updated';
  v_old jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := '.created';
  else
    v_old := to_jsonb(old);
    if v_old ->> 'status' = 'active' and to_jsonb(new) ->> 'status' = 'void' then
      v_action := '.voided';
    end if;
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (auth.uid(), tg_argv[0] || v_action, tg_argv[0], new.id, v_old, to_jsonb(new));
  return new;
end;
$$;

revoke execute on function audit_finance_change() from public, anon, authenticated;

create trigger expenses_audit
  after insert or update on expenses
  for each row execute function audit_finance_change('expense');

create trigger expense_categories_audit
  after insert or update on expense_categories
  for each row execute function audit_finance_change('expense_category');

alter table expenses enable row level security;
alter table expense_categories enable row level security;

-- Managers only — operators, drivers and customers see nothing.
create policy expense_categories_select on expense_categories for select using ((select is_manager()));
create policy expense_categories_insert on expense_categories for insert with check ((select is_manager()));
create policy expense_categories_update on expense_categories
  for update using ((select is_manager())) with check ((select is_manager()));

create policy expenses_select on expenses for select using ((select is_manager()));
create policy expenses_insert on expenses
  for insert with check ((select is_manager()) and created_by = (select auth.uid()));
create policy expenses_update on expenses
  for update using ((select is_manager())) with check ((select is_manager()));
-- No delete policies (and the triggers refuse deletes for every caller).

revoke all on expenses, expense_categories from anon;
revoke delete on expenses, expense_categories from authenticated;

-- ── 5. Performance report ────────────────────────────────────────────────
create function assert_report_period(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a valid reporting period';
  end if;
  if p_to - p_from > 365 then
    raise exception 'A reporting period can be at most 366 days';
  end if;
end;
$$;

revoke execute on function assert_report_period(date, date) from public, anon, authenticated;

-- Accrual basis: revenue is recognised on the day a delivery is completed
-- (or a merchant shipment is returned), expenses on the day incurred.
--   R  = merchant service + merchant return charges + merchant cash
--        handling fees + individual/walk-in service + other approved revenue
--        (none is recorded by the system today, so 0).
--   COD goods money is NOT revenue; it is reported separately as a memo.
--   P1 = R − F, P2 = P1 − S, P3 = P2 − L, P4 = P3 − H, net = P4 − O.
--   Break-even target = total expenditure; gap = max(0, expenditure − R).
create function business_performance_summary(p_from date, p_to date)
returns table (
  merchant_service_revenue numeric,
  merchant_return_revenue numeric,
  merchant_cash_handling_revenue numeric,
  individual_revenue numeric,
  other_revenue numeric,
  total_revenue numeric,
  merchant_cod_collected numeric,
  delivered_count bigint,
  merchant_delivered_count bigint,
  individual_delivered_count bigint,
  returned_count bigint,
  fuel numeric,
  subscription numeric,
  salary numeric,
  rent numeric,
  other_expenses numeric,
  total_expenditure numeric,
  expense_count bigint,
  profit_after_fuel numeric,
  profit_after_subscription numeric,
  profit_after_salary numeric,
  profit_after_rent numeric,
  net_operating_profit numeric,
  break_even_revenue numeric,
  break_even_gap numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  e record;
  v_total_revenue numeric(14, 2);
  v_total_exp numeric(14, 2);
begin
  if not (select is_manager()) then
    raise exception 'Only a manager can view the performance report';
  end if;
  perform assert_report_period(p_from, p_to);

  select
    coalesce(sum(l.service_charge) filter (where l.is_merchant), 0)::numeric(14, 2) as m_service,
    coalesce(sum(l.return_charge) filter (where l.is_merchant), 0)::numeric(14, 2) as m_return,
    coalesce(sum(l.cash_handling_fee) filter (where l.is_merchant), 0)::numeric(14, 2) as m_handling,
    coalesce(sum(l.service_charge) filter (where not l.is_merchant), 0)::numeric(14, 2) as i_service,
    coalesce(sum(l.cod_collected) filter (where l.is_merchant), 0)::numeric(14, 2) as m_cod,
    count(*) filter (where l.event = 'delivered') as delivered,
    count(*) filter (where l.event = 'delivered' and l.is_merchant) as m_delivered,
    count(*) filter (where l.event = 'delivered' and not l.is_merchant) as i_delivered,
    count(*) filter (where l.event = 'returned') as returned
  into r
  from financial_shipment_lines(p_from, p_to, null) l;

  select
    coalesce(sum(x.amount) filter (where c.profit_group = 'fuel'), 0)::numeric(14, 2) as fuel,
    coalesce(sum(x.amount) filter (where c.profit_group = 'subscription'), 0)::numeric(14, 2) as subscription,
    coalesce(sum(x.amount) filter (where c.profit_group = 'salary'), 0)::numeric(14, 2) as salary,
    coalesce(sum(x.amount) filter (where c.profit_group = 'rent'), 0)::numeric(14, 2) as rent,
    coalesce(sum(x.amount) filter (where c.profit_group = 'other'), 0)::numeric(14, 2) as other,
    count(x.id) as n
  into e
  from expenses x
  join expense_categories c on c.id = x.category_id
  where x.status = 'active' and x.incurred_on between p_from and p_to;

  v_total_revenue := r.m_service + r.m_return + r.m_handling + r.i_service;
  v_total_exp := e.fuel + e.subscription + e.salary + e.rent + e.other;

  return query select
    r.m_service, r.m_return, r.m_handling, r.i_service, 0::numeric(14, 2), v_total_revenue,
    r.m_cod, r.delivered, r.m_delivered, r.i_delivered, r.returned,
    e.fuel, e.subscription, e.salary, e.rent, e.other, v_total_exp, e.n,
    (v_total_revenue - e.fuel)::numeric(14, 2),
    (v_total_revenue - e.fuel - e.subscription)::numeric(14, 2),
    (v_total_revenue - e.fuel - e.subscription - e.salary)::numeric(14, 2),
    (v_total_revenue - e.fuel - e.subscription - e.salary - e.rent)::numeric(14, 2),
    (v_total_revenue - v_total_exp)::numeric(14, 2),
    v_total_exp,
    greatest(v_total_exp - v_total_revenue, 0)::numeric(14, 2);
end;
$$;

revoke execute on function business_performance_summary(date, date) from public, anon;
grant execute on function business_performance_summary(date, date) to authenticated;

-- Expenditure per category for the period (every category with spending,
-- plus every active category so the four starting ones always show).
create function expense_category_totals(p_from date, p_to date)
returns table (category_id uuid, name text, profit_group text, is_system boolean, active boolean, total numeric, expense_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (select is_manager()) then
    raise exception 'Only a manager can view the performance report';
  end if;
  perform assert_report_period(p_from, p_to);

  return query
  select c.id, c.name, c.profit_group, c.is_system, c.active,
    coalesce(sum(x.amount), 0)::numeric(14, 2), count(x.id)
  from expense_categories c
  left join expenses x on x.category_id = c.id and x.status = 'active' and x.incurred_on between p_from and p_to
  group by c.id
  having c.active or count(x.id) > 0
  order by array_position(array['salary', 'rent', 'fuel', 'subscription', 'other'], c.profit_group), c.is_system desc, c.name;
end;
$$;

revoke execute on function expense_category_totals(date, date) from public, anon;
grant execute on function expense_category_totals(date, date) to authenticated;
