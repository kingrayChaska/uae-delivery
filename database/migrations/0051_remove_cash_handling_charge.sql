-- Merchant statements: no cash-handling charge.
--
-- 0044/0045 deducted a cash-handling fee — 1.5% of the verified COD
-- collected (financial_rates.cash_handling_rate) — from what a merchant is
-- paid out. The business has dropped it (confirmed 2026-10-20): merchants
-- are charged only the delivery fees of the merchant fee policy (0050: no
-- fee on COD shipments, AED 20 / AED 15 flat for Next-Day bookings of 2–4 /
-- 5+), so the COD collected for them is paid out in full.
--
--   financial_shipment_lines()  cash_handling_fee and cash_handling_rate are
--                               0 on every line, for every period — drafts,
--                               new and regenerated statements, the
--                               performance report and its export.
--   financial_policy()          reports a 0 cash-handling rate (statement
--                               headers store what this returns).
--   set_financial_rates()       refuses any cash-handling rate but 0; the
--                               return-charge rate is set as before.
--
-- Published statements are records of what was issued and are never
-- edited (0044's triggers): any 1.5% already on one stays on it, and a
-- correction (a new statement superseding it, 0044) is issued without it.
-- The rate history keeps its old rows; nothing reads their cash-handling
-- column any more. Unpublished drafts were computed with the fee: they
-- are listed below so a manager discards and regenerates them.

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
      -- Removed (0051): merchants are billed the flat delivery rates (0050)
      -- and nothing on the COD they're paid.
      0::numeric(12, 2) as cash_handling_fee,
      (coalesce(cod.fee_verified, 0) + coalesce(pay.paid, 0))::numeric(12, 2) as payments_received,
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

create or replace function financial_policy(p_on date default null)
returns table (return_charge_rate numeric, cash_handling_rate numeric)
language sql
stable
security definer
set search_path = public
as $$
  select r.return_charge_rate, 0::numeric
  from financial_rates r
  where r.effective_from <= coalesce(p_on, (now() at time zone 'Asia/Dubai')::date)
  order by r.effective_from desc
  limit 1;
$$;

-- Wraps 0045's function: the same checks, then a cash-handling rate of 0.
alter function set_financial_rates(date, numeric, numeric, text) rename to set_financial_rates_0045;
revoke execute on function set_financial_rates_0045(date, numeric, numeric, text) from public, anon, authenticated;

create function set_financial_rates(p_effective_from date, p_return_charge_rate numeric, p_cash_handling_rate numeric default 0, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_cash_handling_rate, 0) <> 0 then
    raise exception 'The cash-handling charge has been removed; merchants are billed the flat delivery rates';
  end if;
  return set_financial_rates_0045(p_effective_from, p_return_charge_rate, 0, p_note);
end;
$$;

revoke execute on function set_financial_rates(date, numeric, numeric, text) from public, anon;
grant execute on function set_financial_rates(date, numeric, numeric, text) to authenticated;

do $$
declare
  v_drafts text;
begin
  select string_agg(id::text, ', ') into v_drafts
  from merchant_statements where status = 'draft' and cash_handling_fee > 0;
  if v_drafts is not null then
    raise notice 'Draft statements still carrying a cash-handling fee — discard and regenerate them: %', v_drafts;
  end if;
end;
$$;
