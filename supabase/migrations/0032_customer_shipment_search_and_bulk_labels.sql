-- Customer/merchant order management: shipment search and bulk labels.
--
-- 1. search_customer_shipments(). The signed-in customer's own shipments
--    (customer_id = auth.uid(), the same scope as the Deliveries list) —
--    or, with p_business_account_id, every shipment of a business account
--    the caller is a member of (what the merchant page's Shipments card
--    counts: business_shipment_stats) — filtered in the database by name
--    or phone, status and booking date,
--    newest first. The app pages it with PostgREST's .range() and an exact
--    count, so a filtered view loads one page of matches — never every
--    shipment for the browser to filter. SECURITY INVOKER: shipments RLS
--    still applies on top of the explicit customer check.
--
--      Name   pickup_contact_name or dropoff_contact_name (the sender and
--             the recipient on the label), partial and case-insensitive.
--      Phone  pickup_contact_phone or dropoff_contact_phone, compared by
--             phone_search_key() below so "+971 50 123 4567", "0501234567"
--             and "050-123-4567" all match each other. Stored numbers are
--             never rewritten.
--      Status any of p_statuses (the app sends one status, or the group
--             the dashboard calls "Active").
--      Date   the booking date (created_at) in UAE time, inclusive at both
--             ends; either end may be left open.
--
--    One search box covers name and phone (OR); the filter types combine
--    with AND.
--
-- 2. get_batch_qr_tokens(). Every QR token for one batch in one call, for
--    printing all of a bulk shipment's labels at once. The same audience as
--    get_shipment_qr_token() (migration 0017): the booking customer or
--    staff — shipment_secrets itself stays unreadable.
--
-- 3. One index: the customer's list filtered by status, newest first (the
--    dashboard cards open exactly that). Name and phone matching runs
--    inside one customer's rows, which shipments_customer_created_idx
--    (migration 0021) already narrows to; a trigram index over every
--    shipment's names and phones would be paid for on every insert and
--    rarely chosen over that.

-- ── Phone matching ───────────────────────────────────────────────────────

-- Digits only, without the UAE country code or the national trunk 0:
-- "+971 50 123 4567" -> "501234567", "0501234567" -> "501234567",
-- "00971501234567" -> "501234567". Other countries' numbers keep their
-- digits as entered.
create function phone_search_key(p_phone text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '^(00971|971|0)', '');
$$;

revoke execute on function phone_search_key(text) from public, anon;
grant execute on function phone_search_key(text) to authenticated;

-- ── 1. Customer shipment search ──────────────────────────────────────────

-- p_query is matched literally against names: LIKE wildcards in it (% and
-- _) and the escape character are escaped, so "50%" finds "50%". It is
-- also read as a phone number when it has at least 3 digits.
create function search_customer_shipments(
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

revoke execute on function search_customer_shipments(text, shipment_status[], date, date, uuid) from public, anon;
grant execute on function search_customer_shipments(text, shipment_status[], date, date, uuid) to authenticated;

create index shipments_customer_status_created_idx on shipments (customer_id, status, created_at desc);
-- The business-wide list, newest first (shipments_business_account_idx
-- from migration 0006 has no order).
create index shipments_business_created_idx on shipments (business_account_id, created_at desc) where business_account_id is not null;

-- ── 2. A batch's QR tokens, for its labels ───────────────────────────────

create function get_batch_qr_tokens(p_batch_id uuid)
returns table (shipment_id uuid, qr_token text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, secrets.qr_token
  from shipments s
  join shipment_secrets secrets on secrets.shipment_id = s.id
  where s.batch_id = p_batch_id
    and (s.customer_id = (select auth.uid()) or (select is_staff()));
$$;

revoke execute on function get_batch_qr_tokens(uuid) from public, anon;
grant execute on function get_batch_qr_tokens(uuid) to authenticated;
