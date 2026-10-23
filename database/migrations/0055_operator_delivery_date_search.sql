-- Let staff filter by the date a shipment was delivered, independently of
-- its booking date. The delivery event is the append-only status history
-- entry, not shipments.created_at or shipments.updated_at.
create function search_staff_shipments_with_delivery_date(
  p_query text default null,
  p_statuses shipment_status[] default null,
  p_from date default null,
  p_to date default null,
  p_delivered_from date default null,
  p_delivered_to date default null,
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
  select matches.*
  from search_staff_shipments(
    p_query,
    p_statuses,
    p_from,
    p_to,
    p_account_type,
    p_bulk_only,
    p_batch_id
  ) matches
  where (
    (p_delivered_from is null and p_delivered_to is null)
    or exists (
      select 1
      from shipment_status_history h
      where h.shipment_id = matches.id
        and h.status = 'delivered'
        and (p_delivered_from is null or h.created_at >= (p_delivered_from::timestamp at time zone 'Asia/Dubai'))
        and (p_delivered_to is null or h.created_at < ((p_delivered_to + 1)::timestamp at time zone 'Asia/Dubai'))
    )
  );
$$;

revoke execute on function search_staff_shipments_with_delivery_date(
  text, shipment_status[], date, date, date, date, account_type, boolean, uuid
) from public, anon;
grant execute on function search_staff_shipments_with_delivery_date(
  text, shipment_status[], date, date, date, date, account_type, boolean, uuid
) to authenticated;
