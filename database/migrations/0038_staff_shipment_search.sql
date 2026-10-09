-- Operator and manager dashboards: search and filter every shipment.
--
-- search_staff_shipments() is the staff counterpart of
-- search_customer_shipments() (0032/0036) and search_driver_shipments()
-- (0035): the same query/status/date parameters, matching rules and paging
-- (PostgREST .range() with an exact count), so the staff Shipments list
-- uses the same filters. Only the scope and the searched fields differ.
--
--      Scope    every shipment — but only for staff: the explicit
--               is_staff() check means a customer or driver calling it gets
--               nothing, not "whatever RLS lets them see". SECURITY
--               INVOKER, so shipments RLS still applies on top.
--      Text     one search box, partial and case-insensitive, matching any
--               of (OR):
--                 the shipment's own fields: tracking_number /
--                   legacy_tracking_number, sender and recipient names,
--                   pickup / drop-off address and building, and both phone
--                   numbers (by phone_search_key(), 0032, so any format
--                   matches)
--                 who booked it: the customer's name or email, or the
--                   company name of the business account it was booked
--                   under
--                 who carries it: the driver's name
--               Stored values are never rewritten.
--      Status   any of p_statuses.
--      Date     the booking date (created_at) in UAE time, inclusive at
--               both ends; either end may be open.
--      Category the list's tabs: p_account_type (the booking customer's
--               account type: Individual / Merchant), p_bulk_only (part of
--               a bulk booking — a real shipment_batches row, never a
--               quantity), p_batch_id (one bulk booking).
--
--    Filter types combine with AND.
--
-- Index: unlike a customer's or a driver's list, this one isn't narrowed
-- to one person's rows first, so substring matching gets a trigram index
-- (pg_trgm, installed by 0030) over one search document per shipment:
-- shipment_search_document() joins the searched fields with newlines (a
-- search term never contains one, so a match can't straddle two fields)
-- and lower-cases them. The people and company lookups use their own
-- indexes (profiles_customer_name_trgm_idx and
-- business_accounts_company_name_trgm_idx, 0030) and reach shipments
-- through the existing customer / driver / business account indexes.

-- ── Search document ──────────────────────────────────────────────────────

create function shipment_search_document(
  p_tracking_number text,
  p_legacy_tracking_number text,
  p_pickup_contact_name text,
  p_dropoff_contact_name text,
  p_pickup_address text,
  p_dropoff_address text,
  p_pickup_building text,
  p_dropoff_building text,
  p_pickup_contact_phone text,
  p_dropoff_contact_phone text
)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(
    coalesce(p_tracking_number, '') || E'\n' ||
    coalesce(p_legacy_tracking_number, '') || E'\n' ||
    coalesce(p_pickup_contact_name, '') || E'\n' ||
    coalesce(p_dropoff_contact_name, '') || E'\n' ||
    coalesce(p_pickup_address, '') || E'\n' ||
    coalesce(p_dropoff_address, '') || E'\n' ||
    coalesce(p_pickup_building, '') || E'\n' ||
    coalesce(p_dropoff_building, '') || E'\n' ||
    phone_search_key(p_pickup_contact_phone) || E'\n' ||
    phone_search_key(p_dropoff_contact_phone)
  );
$$;

revoke execute on function shipment_search_document(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function shipment_search_document(text, text, text, text, text, text, text, text, text, text) to authenticated;

do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format(
    'create index shipments_search_trgm_idx on shipments using gin (
       shipment_search_document(
         tracking_number, legacy_tracking_number, pickup_contact_name, dropoff_contact_name,
         pickup_address, dropoff_address, pickup_building, dropoff_building,
         pickup_contact_phone, dropoff_contact_phone
       ) %I.gin_trgm_ops
     )',
    v_schema
  );
end;
$$;

-- ── Search ───────────────────────────────────────────────────────────────

-- p_query is matched literally: LIKE wildcards in it (% and _) and the
-- escape character are escaped, so "50%" finds "50%". It is also read as a
-- phone number when it has at least 3 digits.
create function search_staff_shipments(
  p_query text default null,
  p_statuses shipment_status[] default null,
  p_from date default null,
  p_to date default null,
  p_account_type account_type default null,
  p_bulk_only boolean default false,
  p_batch_id uuid default null
)
returns setof shipments
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select
      nullif(btrim(regexp_replace(left(p_query, 100), '[\r\n]+', ' ', 'g')), '') as text,
      regexp_replace(coalesce(left(p_query, 100), ''), '\D', '', 'g') as digits
  ),
  params as (
    select
      term.text,
      case
        when term.text is null then null
        else '%' || replace(replace(replace(lower(term.text), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pattern,
      case
        when length(term.digits) < 3 then null
        -- "971..." or "05..." typed as the start of a number: match the
        -- key; too little left after stripping the prefix: the raw digits.
        when length(phone_search_key(term.digits)) >= 3 then '%' || phone_search_key(term.digits) || '%'
        else '%' || term.digits || '%'
      end as phone_pattern
    from term
  ),
  people as (
    -- Who booked it, who carries it, and the company it was booked under:
    -- looked up once, then matched by id.
    select
      (select coalesce(array_agg(p.id), '{}') from profiles p
        where p.role = 'customer' and (p.full_name ilike params.pattern or p.email ilike params.pattern)) as customer_ids,
      (select coalesce(array_agg(p.id), '{}') from profiles p
        where p.role = 'driver' and p.full_name ilike params.pattern) as driver_ids,
      (select coalesce(array_agg(ba.id), '{}') from business_accounts ba
        where ba.company_name ilike params.pattern) as business_ids
    from params
    where params.pattern is not null
  )
  select s.*
  from shipments s
  cross join params
  left join people on true
  where (select is_staff())
    and (p_statuses is null or s.status = any (p_statuses))
    and (p_from is null or s.created_at >= (p_from::timestamp at time zone 'Asia/Dubai'))
    and (p_to is null or s.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Dubai'))
    and (p_batch_id is null or s.batch_id = p_batch_id)
    and (not coalesce(p_bulk_only, false) or s.batch_id is not null)
    and (
      p_account_type is null
      or exists (select 1 from profiles c where c.id = s.customer_id and c.account_type = p_account_type)
    )
    and (
      params.pattern is null
      or shipment_search_document(
           s.tracking_number, s.legacy_tracking_number, s.pickup_contact_name, s.dropoff_contact_name,
           s.pickup_address, s.dropoff_address, s.pickup_building, s.dropoff_building,
           s.pickup_contact_phone, s.dropoff_contact_phone
         ) like params.pattern
      or (
        params.phone_pattern is not null
        and shipment_search_document(
              s.tracking_number, s.legacy_tracking_number, s.pickup_contact_name, s.dropoff_contact_name,
              s.pickup_address, s.dropoff_address, s.pickup_building, s.dropoff_building,
              s.pickup_contact_phone, s.dropoff_contact_phone
            ) like params.phone_pattern
      )
      or s.customer_id = any (people.customer_ids)
      or s.driver_id = any (people.driver_ids)
      or s.business_account_id = any (people.business_ids)
    )
  order by s.created_at desc, s.id desc;
$$;

-- Explicit revoke: 0018's schema-level default can't remove Postgres's
-- built-in EXECUTE-to-PUBLIC on new functions.
revoke execute on function search_staff_shipments(text, shipment_status[], date, date, account_type, boolean, uuid) from public, anon;
grant execute on function search_staff_shipments(text, shipment_status[], date, date, account_type, boolean, uuid) to authenticated;
