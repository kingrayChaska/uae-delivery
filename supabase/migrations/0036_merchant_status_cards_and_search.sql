-- Merchant dashboard: shipment status cards, and a fuller shipment search.
--
-- 1. customer_shipment_status_counts(). How many of the caller's own
--    shipments (customer_id = auth.uid(), the scope of the dashboard and
--    the Deliveries list it links to) are in each status, as one grouped
--    query: the dashboard's cards (Active, Awaiting payment, Completed and
--    the merchant's In transit / Delivered / Returned / Cancelled) all read
--    from it instead of running one count each. A bulk shipment's
--    shipments are rows of their own, so each counts individually.
--    SECURITY INVOKER: shipments RLS still applies on top; no id
--    parameter, so no one else's counts can be asked for. Counted from the
--    persisted status, so an operator's change shows on the next load.
--    shipments_customer_status_created_idx (migration 0032) covers it.
--
-- 2. search_customer_shipments() (migration 0032) also matches the
--    shipment ID (tracking_number, or legacy_tracking_number from
--    migration 0022) and the pickup/drop-off address and building
--    (migration 0025), as the driver's search does (migration 0035).
--    Same signature, scope, parameters and paging; name and phone match
--    exactly as before. Stored values are never rewritten.

-- ── 1. Status counts ─────────────────────────────────────────────────────

create function customer_shipment_status_counts()
returns table (status shipment_status, shipment_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select s.status, count(*)
  from shipments s
  where s.customer_id = (select auth.uid())
  group by s.status;
$$;

-- Explicit revoke: 0018's schema-level default can't remove Postgres's
-- built-in EXECUTE-to-PUBLIC on new functions.
revoke execute on function customer_shipment_status_counts() from public, anon;
grant execute on function customer_shipment_status_counts() to authenticated;

-- ── 2. Search: shipment ID and address too ───────────────────────────────

create or replace function search_customer_shipments(
  p_query text default null,
  p_statuses shipment_status[] default null,
  p_from date default null,
  p_to date default null,
  p_business_account_id uuid default null
)
returns setof shipments
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select
      nullif(btrim(left(p_query, 100)), '') as text,
      regexp_replace(coalesce(left(p_query, 100), ''), '\D', '', 'g') as digits
  ),
  params as (
    select
      case
        when term.text is null then null
        else '%' || replace(replace(replace(term.text, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pattern,
      case
        when length(term.digits) < 3 then null
        -- "971..." or "05..." typed as the start of a number: match the
        -- key; too little left after stripping the prefix: the raw digits.
        when length(phone_search_key(term.digits)) >= 3 then phone_search_key(term.digits)
        else term.digits
      end as phone
    from term
  )
  select s.*
  from shipments s
  cross join params
  where (
      case
        when p_business_account_id is null then s.customer_id = (select auth.uid())
        -- Members only: a non-member gets nothing, whatever RLS allows.
        else s.business_account_id = p_business_account_id
          and exists (
            select 1
            from business_account_members m
            where m.business_account_id = p_business_account_id
              and m.profile_id = (select auth.uid())
          )
      end
    )
    and (p_statuses is null or s.status = any (p_statuses))
    and (p_from is null or s.created_at >= (p_from::timestamp at time zone 'Asia/Dubai'))
    and (p_to is null or s.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Dubai'))
    and (
      params.pattern is null
      or s.pickup_contact_name ilike params.pattern
      or s.dropoff_contact_name ilike params.pattern
      or s.tracking_number ilike params.pattern
      or s.legacy_tracking_number ilike params.pattern
      or s.pickup_address ilike params.pattern
      or s.dropoff_address ilike params.pattern
      or s.pickup_building ilike params.pattern
      or s.dropoff_building ilike params.pattern
      or (
        params.phone is not null
        and (
          strpos(phone_search_key(s.pickup_contact_phone), params.phone) > 0
          or strpos(phone_search_key(s.dropoff_contact_phone), params.phone) > 0
        )
      )
    )
  order by s.created_at desc, s.id desc;
$$;

-- create or replace keeps the function's grants; restated so this file
-- reads complete on its own.
revoke execute on function search_customer_shipments(text, shipment_status[], date, date, uuid) from public, anon;
grant execute on function search_customer_shipments(text, shipment_status[], date, date, uuid) to authenticated;
