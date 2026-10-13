-- Financial reporting, part 2 (builds on 0044):
--
-- 1. Configurable rates. The return-charge and cash-handling rates were
--    constants in financial_policy(). They now live in financial_rates, an
--    append-only history of rates with the day each takes effect. Every
--    shipment is charged at the rate in force on the day it was completed
--    (Asia/Dubai), so a new rate never changes a figure already earned:
--    statements, and the performance report for earlier periods, stay as
--    they were. A rate can only take effect today or later; a scheduled
--    rate can be replaced until its day has passed. Managers only, through
--    set_financial_rates(); audited.
--
-- 2. Statement emails. Publishing can also email the merchant that a
--    statement is ready (an outbox like operator_booking_emails, 0043). The
--    email carries no figures — only the statement number, the period and a
--    link to the signed-in Account Reports page. Recipients are the business
--    account's contact email and its active members' account emails, read
--    by the sender from the database — never taken from a request.
--
-- 3. Settlements. merchant_statement_settlements records the money that
--    actually changes hands for a statement: ParcelLink paying out a
--    remittance, or the merchant paying an amount due. The balance of a
--    statement counts the settlements recorded against it AND against the
--    statements it corrected, so a correction never asks for money already
--    paid. A settlement can't exceed what is outstanding, is never deleted
--    or edited, and can only be voided with a reason. Once a shipment is on
--    a published statement its COD is paid out through settlements: the old
--    per-shipment "remit" step is refused for it, so it can't be paid twice.

-- ── 1. Rates ─────────────────────────────────────────────────────────────
create table financial_rates (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  return_charge_rate numeric(6, 4) not null check (return_charge_rate >= 0 and return_charge_rate <= 1),
  cash_handling_rate numeric(6, 4) not null check (cash_handling_rate >= 0 and cash_handling_rate <= 0.2),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger financial_rates_set_updated_at
  before update on financial_rates
  for each row execute function set_updated_at();

-- The rates 0044 used, in force from the start.
insert into financial_rates (effective_from, return_charge_rate, cash_handling_rate, note)
values ('2000-01-01', 0.50, 0.0150, 'Initial rates');

-- A rate that is already in force (or was) never changes and is never
-- deleted — every caller, the service role included.
create function enforce_financial_rate_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or old.effective_from < (now() at time zone 'Asia/Dubai')::date
    or new.effective_from is distinct from old.effective_from then
    raise exception 'Rates already in force can''t be changed';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_financial_rate_history() from public, anon, authenticated;

create trigger financial_rates_history
  before update or delete on financial_rates
  for each row execute function enforce_financial_rate_history();

alter table financial_rates enable row level security;
create policy financial_rates_select on financial_rates for select using ((select is_manager()));
revoke all on financial_rates from anon;
revoke insert, update, delete on financial_rates from authenticated;

-- The rates in force on a day (today by default).
drop function financial_policy();

create function financial_policy(p_on date default null)
returns table (return_charge_rate numeric, cash_handling_rate numeric)
language sql
stable
security definer
set search_path = public
as $$
  select r.return_charge_rate, r.cash_handling_rate
  from financial_rates r
  where r.effective_from <= coalesce(p_on, (now() at time zone 'Asia/Dubai')::date)
  order by r.effective_from desc
  limit 1;
$$;

revoke execute on function financial_policy(date) from public, anon;
grant execute on function financial_policy(date) to authenticated;

-- Sets the rates from a day on (today or later). A rate already scheduled
-- for that day is replaced.
create function set_financial_rates(p_effective_from date, p_return_charge_rate numeric, p_cash_handling_rate numeric, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_old financial_rates%rowtype;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform require_statement_manager();
  if p_effective_from is null or p_effective_from < v_today then
    raise exception 'New rates can only take effect from today onwards';
  end if;
  if p_return_charge_rate is null or p_return_charge_rate < 0 or p_return_charge_rate > 1
    or p_return_charge_rate <> round(p_return_charge_rate, 4) then
    raise exception 'The return charge rate must be between 0%% and 100%%';
  end if;
  if p_cash_handling_rate is null or p_cash_handling_rate < 0 or p_cash_handling_rate > 0.2
    or p_cash_handling_rate <> round(p_cash_handling_rate, 4) then
    raise exception 'The cash-handling rate must be between 0%% and 20%%';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('financial_rates', 0));
  select * into v_old from financial_rates where effective_from = p_effective_from;

  if found then
    update financial_rates
    set return_charge_rate = p_return_charge_rate, cash_handling_rate = p_cash_handling_rate, note = v_note, updated_by = v_actor
    where id = v_old.id
    returning id into v_id;
  else
    insert into financial_rates (effective_from, return_charge_rate, cash_handling_rate, note, created_by)
    values (p_effective_from, p_return_charge_rate, p_cash_handling_rate, v_note, v_actor)
    returning id into v_id;
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_actor, 'financial_rates.set', 'financial_rate', v_id,
    case when v_old.id is null then null
      else jsonb_build_object('returnChargeRate', v_old.return_charge_rate, 'cashHandlingRate', v_old.cash_handling_rate) end,
    jsonb_build_object('effectiveFrom', p_effective_from, 'returnChargeRate', p_return_charge_rate,
      'cashHandlingRate', p_cash_handling_rate, 'note', v_note));

  return v_id;
end;
$$;

revoke execute on function set_financial_rates(date, numeric, numeric, text) from public, anon;
grant execute on function set_financial_rates(date, numeric, numeric, text) to authenticated;

-- ── The engine, now at the rate in force on each completion day ──────────
drop function financial_shipment_lines(date, date, uuid);

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
  cod_remitted numeric,
  return_charge_rate numeric,
  cash_handling_rate numeric
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
  candidates as (
    select distinct h.shipment_id
    from shipment_status_history h, bounds b
    where h.status in ('delivered', 'returned')
      and h.created_at >= b.from_ts and h.created_at < b.to_ts
  ),
  ev as (
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
          then round(greatest(s.price - coalesce(s.cod_charge, 0), 0) * rate.return_charge_rate, 2)
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
        when s.business_account_id is not null then round(coalesce(cod.goods_verified, 0) * rate.cash_handling_rate, 2)
        else 0
      end::numeric(12, 2) as cash_handling_fee,
      (coalesce(cod.fee_verified, 0) + coalesce(pay.paid, 0))::numeric(12, 2) as payments_received,
      coalesce(cod.fee_unverified, 0)::numeric(12, 2) as fees_unverified,
      coalesce(cod.goods_remitted, 0)::numeric(12, 2) as cod_remitted,
      rate.return_charge_rate,
      rate.cash_handling_rate
    from ev
    join shipments s on s.id = ev.id
    cross join bounds b
    cross join lateral (
      select r.return_charge_rate, r.cash_handling_rate
      from financial_rates r
      where r.effective_from <= (ev.event_at at time zone 'Asia/Dubai')::date
      order by r.effective_from desc
      limit 1
    ) rate
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

-- Each line keeps the rates it was charged at; the header keeps the rates
-- in force at the end of the period and says whether they varied.
alter table merchant_statement_lines
  add column return_charge_rate numeric(6, 4),
  add column cash_handling_rate numeric(6, 4);

alter table merchant_statement_lines disable trigger merchant_statement_lines_immutable;
update merchant_statement_lines l
set return_charge_rate = s.return_charge_rate, cash_handling_rate = s.cash_handling_rate
from merchant_statements s
where s.id = l.statement_id;
alter table merchant_statement_lines enable trigger merchant_statement_lines_immutable;

alter table merchant_statement_lines
  alter column return_charge_rate set not null,
  alter column cash_handling_rate set not null;

alter table merchant_statements add column rates_vary boolean not null default false;

-- As 0044, with each line's own rates, and the header's from the rates in
-- force on the period's last day.
create or replace function generate_merchant_statement(
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
    count(distinct currency)::integer as currencies,
    count(distinct (return_charge_rate, cash_handling_rate))::integer as rate_sets
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

  select * into v_policy from financial_policy(p_to);

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
    merchant, currency, return_charge_rate, cash_handling_rate, rates_vary,
    line_count, delivered_count, returned_count,
    total_cod, cod_already_remitted, service_charges, return_charges, cash_handling_base, cash_handling_fee,
    payments_received, net_amount, outcome, kind, cod_unverified, cod_uncollected, fees_unverified, generated_by
  ) values (
    v_id, p_business_account_id, p_from, p_to, 'draft',
    case when p_supersedes is null then 1 else v_old.version + 1 end,
    p_supersedes, v_reason,
    v_merchant, 'AED', v_policy.return_charge_rate, v_policy.cash_handling_rate, v_totals.rate_sets > 1,
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
    cod_uncollected, cash_handling_fee, payments_received, fees_unverified, cod_remitted, currency,
    return_charge_rate, cash_handling_rate
  )
  select
    v_id, row_number() over (order by l.event_at, l.tracking_number), l.shipment_id, l.tracking_number, l.event, l.event_at,
    l.recipient_name, l.delivery_type, l.payment_method, l.recipient_payment_type, l.price, l.service_charge,
    l.return_charge, l.cod_collected, l.cod_unverified, l.cod_uncollected, l.cash_handling_fee, l.payments_received,
    l.fees_unverified, l.cod_remitted, l.currency, l.return_charge_rate, l.cash_handling_rate
  from statement_lines_tmp l;

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

-- ── 2. Statement emails ──────────────────────────────────────────────────
create table merchant_statement_emails (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null unique references merchant_statements (id),
  status text not null default 'pending' check (status in ('pending', 'sending', 'accepted', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  recipient_count integer check (recipient_count is null or recipient_count >= 0),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index merchant_statement_emails_due_idx
  on merchant_statement_emails (next_attempt_at)
  where status in ('pending', 'sending');

create trigger merchant_statement_emails_set_updated_at
  before update on merchant_statement_emails
  for each row execute function set_updated_at();

-- Service role only, like operator_booking_emails.
alter table merchant_statement_emails enable row level security;
revoke all on merchant_statement_emails from anon, authenticated;

create function claim_merchant_statement_emails(p_limit integer, p_lease_seconds integer, p_max_attempts integer)
returns setof merchant_statement_emails
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update merchant_statement_emails e
  set status = 'sending',
      attempts = e.attempts + 1,
      locked_until = now() + make_interval(secs => greatest(p_lease_seconds, 30))
  where e.id in (
    select c.id
    from merchant_statement_emails c
    where c.next_attempt_at <= now()
      and c.attempts < p_max_attempts
      and (c.status = 'pending' or (c.status = 'sending' and c.locked_until < now()))
    order by c.next_attempt_at
    limit greatest(least(p_limit, 50), 1)
    for update skip locked
  )
  returning e.*;
end;
$$;

revoke execute on function claim_merchant_statement_emails(integer, integer, integer) from public, anon, authenticated;
grant execute on function claim_merchant_statement_emails(integer, integer, integer) to service_role;

-- Publishing gains "also email the merchant" (on unless switched off).
drop function publish_merchant_statement(uuid);

create function publish_merchant_statement(p_statement_id uuid, p_send_email boolean default true)
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

  if coalesce(p_send_email, true) then
    insert into merchant_statement_emails (statement_id) values (p_statement_id)
    on conflict (statement_id) do nothing;
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (v_actor, 'statement.published', 'merchant_statement', p_statement_id,
    jsonb_build_object('statementNumber', v_number, 'businessAccountId', v_statement.business_account_id,
      'netAmount', v_statement.net_amount, 'supersedes', v_statement.supersedes_id, 'email', coalesce(p_send_email, true)));

  return v_number;
end;
$$;

revoke execute on function publish_merchant_statement(uuid, boolean) from public, anon;
grant execute on function publish_merchant_statement(uuid, boolean) to authenticated;

-- ── 3. Settlements ───────────────────────────────────────────────────────
create table merchant_statement_settlements (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references merchant_statements (id),
  business_account_id uuid not null references business_accounts (id),
  -- to_merchant: ParcelLink paid the merchant. from_merchant: the merchant paid ParcelLink.
  direction text not null check (direction in ('to_merchant', 'from_merchant')),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  currency text not null default 'AED' check (currency = 'AED'),
  method text not null check (method in ('bank_transfer', 'cash', 'cheque', 'card', 'other')),
  reference text check (reference is null or char_length(reference) <= 100),
  notes text check (notes is null or char_length(notes) <= 500),
  paid_on date not null,
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  void_reason text check (void_reason is null or char_length(void_reason) between 5 and 500),
  voided_by uuid references profiles (id),
  voided_at timestamptz,
  recorded_by uuid not null references profiles (id),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_statement_settlements_void check (
    (status = 'recorded' and void_reason is null and voided_by is null and voided_at is null)
    or (status = 'void' and void_reason is not null and voided_by is not null and voided_at is not null)
  ),
  constraint merchant_statement_settlements_request_unique unique (recorded_by, client_request_id)
);

create index merchant_statement_settlements_statement_idx on merchant_statement_settlements (statement_id);

create trigger merchant_statement_settlements_set_updated_at
  before update on merchant_statement_settlements
  for each row execute function set_updated_at();

create function enforce_statement_settlement_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Settlements can''t be deleted. Void the settlement instead.';
  end if;
  if old.status <> 'recorded' or new.status <> 'void'
    or (to_jsonb(new) - array['status', 'void_reason', 'voided_by', 'voided_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['status', 'void_reason', 'voided_by', 'voided_at', 'updated_at'])
  then
    raise exception 'A settlement can only be voided';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_statement_settlement_immutability() from public, anon, authenticated;

create trigger merchant_statement_settlements_immutable
  before update or delete on merchant_statement_settlements
  for each row execute function enforce_statement_settlement_immutability();

alter table merchant_statement_settlements enable row level security;

-- Managers, and the merchant for statements they can see (published ones).
create policy merchant_statement_settlements_select on merchant_statement_settlements
  for select using ((select is_manager()) or statement_id in (select id from merchant_statements));

revoke all on merchant_statement_settlements from anon;
revoke insert, update, delete on merchant_statement_settlements from authenticated;

-- The statement and every statement it (transitively) corrected.
create function merchant_statement_chain(p_statement_id uuid)
returns table (statement_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive chain as (
    select s.id, s.supersedes_id from merchant_statements s where s.id = p_statement_id
    union all
    select s.id, s.supersedes_id from merchant_statements s join chain c on s.id = c.supersedes_id
  )
  select id from chain;
$$;

revoke execute on function merchant_statement_chain(uuid) from public, anon;
grant execute on function merchant_statement_chain(uuid) to authenticated;

-- Where a statement stands. balance > 0: ParcelLink still owes the merchant;
-- balance < 0: the merchant still owes ParcelLink. SECURITY INVOKER: a
-- merchant gets figures only for a statement RLS lets them see.
create function merchant_statement_balance(p_statement_id uuid)
returns table (net_amount numeric, paid_to_merchant numeric, paid_by_merchant numeric, balance numeric, settlement_status text)
language sql
stable
security invoker
set search_path = public
as $$
  with s as (select m.net_amount from merchant_statements m where m.id = p_statement_id),
  t as (
    select
      coalesce(sum(x.amount) filter (where x.direction = 'to_merchant'), 0)::numeric(12, 2) as paid_to,
      coalesce(sum(x.amount) filter (where x.direction = 'from_merchant'), 0)::numeric(12, 2) as paid_by
    from merchant_statement_settlements x
    where x.status = 'recorded' and x.statement_id in (select c.statement_id from merchant_statement_chain(p_statement_id) c)
  )
  select
    s.net_amount,
    t.paid_to,
    t.paid_by,
    (s.net_amount - t.paid_to + t.paid_by)::numeric(12, 2),
    case
      when s.net_amount - t.paid_to + t.paid_by = 0 then 'settled'
      when t.paid_to + t.paid_by = 0 then 'open'
      else 'partially_settled'
    end
  from s, t;
$$;

revoke execute on function merchant_statement_balance(uuid) from public, anon;
grant execute on function merchant_statement_balance(uuid) to authenticated;

create function record_statement_settlement(
  p_statement_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_on date,
  p_reference text,
  p_notes text,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_statement merchant_statements%rowtype;
  v_existing merchant_statement_settlements%rowtype;
  v_balance numeric(12, 2);
  v_direction text;
  v_id uuid;
begin
  perform require_statement_manager();
  if p_client_request_id is null then
    raise exception 'Missing request id';
  end if;

  select * into v_statement from merchant_statements where id = p_statement_id;
  if not found then
    raise exception 'Statement not found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('merchant_statement:' || v_statement.business_account_id::text, 0));

  select * into v_existing from merchant_statement_settlements
  where recorded_by = v_actor and client_request_id = p_client_request_id;
  if found then
    if v_existing.statement_id <> p_statement_id or v_existing.amount <> p_amount then
      raise exception 'This request was already used for a different settlement';
    end if;
    return v_existing.id;
  end if;

  select * into v_statement from merchant_statements where id = p_statement_id;
  if v_statement.status <> 'published' then
    raise exception 'Payments are recorded against the current published statement';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_amount <> round(p_amount, 2) then
    raise exception 'Use at most two decimal places';
  end if;
  if p_method is null or p_method not in ('bank_transfer', 'cash', 'cheque', 'card', 'other') then
    raise exception 'Choose how the money was paid';
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Dubai')::date then
    raise exception 'The payment date can''t be in the future';
  end if;

  select b.balance into v_balance from merchant_statement_balance(p_statement_id) b;
  if v_balance = 0 then
    raise exception 'This statement is already settled';
  end if;
  v_direction := case when v_balance > 0 then 'to_merchant' else 'from_merchant' end;
  if p_amount > abs(v_balance) then
    raise exception 'This is more than is outstanding on the statement (AED %)', abs(v_balance);
  end if;

  insert into merchant_statement_settlements (
    statement_id, business_account_id, direction, amount, method, reference, notes, paid_on, recorded_by, client_request_id
  ) values (
    p_statement_id, v_statement.business_account_id, v_direction, p_amount, p_method,
    nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), p_paid_on, v_actor, p_client_request_id
  )
  returning id into v_id;

  insert into notifications (profile_id, type, title, body, data)
  select m.profile_id, 'statement.settlement', 'Statement payment recorded',
    case when v_direction = 'to_merchant'
      then 'A payment of AED ' || to_char(p_amount, 'FM999,999,990.00') || ' to you was recorded on statement ' || v_statement.statement_number || '.'
      else 'Your payment of AED ' || to_char(p_amount, 'FM999,999,990.00') || ' was recorded on statement ' || v_statement.statement_number || '.'
    end,
    jsonb_build_object('statementId', p_statement_id)
  from business_account_members m
  join profiles p on p.id = m.profile_id and p.active and p.deleted_at is null
  where m.business_account_id = v_statement.business_account_id;

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (v_actor, 'statement.settlement_recorded', 'merchant_statement_settlement', v_id,
    jsonb_build_object('statementId', p_statement_id, 'direction', v_direction, 'amount', p_amount,
      'method', p_method, 'paidOn', p_paid_on, 'balanceBefore', v_balance));

  return v_id;
end;
$$;

revoke execute on function record_statement_settlement(uuid, numeric, text, date, text, text, uuid) from public, anon;
grant execute on function record_statement_settlement(uuid, numeric, text, date, text, text, uuid) to authenticated;

create function void_statement_settlement(p_settlement_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement merchant_statement_settlements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform require_statement_manager();
  if v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Give a reason for voiding this payment (5 to 500 characters)';
  end if;
  select * into v_settlement from merchant_statement_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_settlement.status = 'void' then
    return;
  end if;

  update merchant_statement_settlements
  set status = 'void', void_reason = v_reason, voided_by = auth.uid(), voided_at = now()
  where id = p_settlement_id;

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (auth.uid(), 'statement.settlement_voided', 'merchant_statement_settlement', p_settlement_id,
    jsonb_build_object('status', 'recorded', 'amount', v_settlement.amount),
    jsonb_build_object('status', 'void', 'reason', v_reason));
end;
$$;

revoke execute on function void_statement_settlement(uuid, text) from public, anon;
grant execute on function void_statement_settlement(uuid, text) to authenticated;

-- COD on a shipment that is on a published statement is paid out through
-- that statement's settlements; the per-shipment remit step would pay it a
-- second time.
create function prevent_remit_of_statement_cod()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
begin
  if new.status = 'remitted' and old.status is distinct from 'remitted' then
    select s.statement_number into v_number
    from merchant_statement_lines l
    join merchant_statements s on s.id = l.statement_id
    where l.shipment_id = new.shipment_id and s.status in ('published', 'superseded')
    limit 1;
    if v_number is not null then
      raise exception 'This shipment''s cash on delivery is paid out through statement %', v_number;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function prevent_remit_of_statement_cod() from public, anon, authenticated;

create trigger cod_transactions_prevent_statement_remit
  before update on cod_transactions
  for each row execute function prevent_remit_of_statement_cod();
