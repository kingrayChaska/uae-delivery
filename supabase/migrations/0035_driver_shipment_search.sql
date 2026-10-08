-- Driver dashboard: search and filter the driver's own assigned shipments.
--
-- search_driver_shipments() is the driver's counterpart of
-- search_customer_shipments() (migration 0032): the same parameters, the
-- same matching rules and the same paging (PostgREST .range() with an
-- exact count), so the Driver's "My Deliveries" page uses the customer
-- list's filters unchanged. Only the scope and the searched fields differ.
--
--      Scope    s.driver_id = auth.uid() — the shipments assigned to the
--               caller, written into the query itself. A driver can't widen
--               it with any parameter: there is no driver/customer id to
--               pass. SECURITY INVOKER, so shipments RLS (shipments_select)
--               still applies on top; a customer, staff member or anonymous
--               caller is assigned nothing and gets nothing.
--      Text     one search box, partial and case-insensitive, matching any
--               of (OR):
--                 name      pickup_contact_name / dropoff_contact_name
--                 ID        tracking_number / legacy_tracking_number
--                 address   pickup_address / dropoff_address, and the
--                           building typed at booking (pickup_building /
--                           dropoff_building, migration 0025)
--                 phone     pickup_contact_phone / dropoff_contact_phone,
--                           via phone_search_key() (migration 0032)
--               These are fields the driver already sees on the shipment;
--               stored values are never rewritten.
--      Status   any of p_statuses.
--      Date     the booking date (created_at) in UAE time, inclusive at
--               both ends; either end may be open. The same date the
--               merchant list filters on and the driver dashboard's
--               "Today's Deliveries" card counts.
--
--    Filter types combine with AND.
--
-- Index: matching runs inside one driver's rows, which
-- shipments_driver_created_idx (migration 0021) narrows to, newest first.

create function search_driver_shipments(
  p_query text default null,
  p_statuses shipment_status[] default null,
  p_from date default null,
  p_to date default null
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
        when length(phone_search_key(term.digits)) >= 3 then phone_search_key(term.digits)
        else term.digits
      end as phone
    from term
  )
  select s.*
  from shipments s
  cross join params
  where s.driver_id = (select auth.uid())
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

-- Explicit revoke: 0018's schema-level default can't remove Postgres's
-- built-in EXECUTE-to-PUBLIC on new functions.
revoke execute on function search_driver_shipments(text, shipment_status[], date, date) from public, anon;
grant execute on function search_driver_shipments(text, shipment_status[], date, date) to authenticated;
