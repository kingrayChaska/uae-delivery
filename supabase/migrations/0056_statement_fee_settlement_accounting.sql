-- Separate delivery fees settled outside COD from fees still due through COD.
-- Existing statements retain accounting version 1 and remain immutable;
-- statements generated from this migration use version 2.

alter table merchant_statements
  add column accounting_version smallint not null default 1
    check (accounting_version in (1, 2));

create or replace function financial_shipment_lines(p_from date, p_to date, p_business_account_id uuid default null)
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
      0::numeric(12, 2) as cash_handling_fee,
      case when ev.event = 'delivered' then
        least(s.price, greatest(coalesce(cod.fee_verified, 0), coalesce(pay.paid, 0)))
      else 0 end::numeric(12, 2) as payments_received,
      coalesce(cod.fee_unverified, 0)::numeric(12, 2) as fees_unverified,
      coalesce(cod.goods_remitted, 0)::numeric(12, 2) as cod_remitted,
      rate.return_charge_rate,
      0::numeric as cash_handling_rate
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

  v_net := v_totals.total_cod - v_totals.cod_remitted
    - greatest(v_totals.service_charges - v_totals.payments_received, 0)
    - v_totals.return_charges - v_totals.cash_handling_fee;

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
    id, business_account_id, period_start, period_end, status, version, accounting_version, supersedes_id, correction_reason,
    merchant, currency, return_charge_rate, cash_handling_rate, rates_vary,
    line_count, delivered_count, returned_count,
    total_cod, cod_already_remitted, service_charges, return_charges, cash_handling_base, cash_handling_fee,
    payments_received, net_amount, outcome, kind, cod_unverified, cod_uncollected, fees_unverified, generated_by
  ) values (
    v_id, p_business_account_id, p_from, p_to, 'draft',
    case when p_supersedes is null then 1 else v_old.version + 1 end,
    2, p_supersedes, v_reason,
    v_merchant, 'AED', v_policy.return_charge_rate, 0, v_totals.rate_sets > 1,
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

  if (select coalesce(sum(cod_collected - cod_remitted - greatest(service_charge - payments_received, 0)
      - return_charge - cash_handling_fee), 0)
      from merchant_statement_lines where statement_id = v_id) <> v_net then
    raise exception 'Statement total does not match its lines';
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (v_actor, 'statement.generated', 'merchant_statement', v_id,
    jsonb_build_object('businessAccountId', p_business_account_id, 'from', p_from, 'to', p_to,
      'netAmount', v_net, 'accountingVersion', 2, 'lines', v_totals.line_count, 'supersedes', p_supersedes, 'reason', v_reason));

  return v_id;
end;
$$;
