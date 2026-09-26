-- Performance pass. Nothing here changes who can see what: every policy
-- below is re-created with exactly the same conditions as before.
--
-- 1. RLS initPlans. A bare auth.uid() / is_staff() in a policy can be
--    evaluated once per row scanned — and is_staff() is a SECURITY DEFINER
--    lookup on profiles, so a staff member listing 10,000 shipments paid
--    for 10,000 profile lookups. Wrapping them as (select ...) makes
--    Postgres evaluate them once per query (Supabase's documented RLS
--    performance fix).
-- 2. Indexes for the filters and sorts the app actually runs.
-- 3. Aggregate views, so list pages ask the database for counts and totals
--    instead of downloading every shipment row and counting in JavaScript
--    (which also silently broke past PostgREST's 1,000-row response cap).

-- ── 1. Policies ──────────────────────────────────────────────────────────

drop policy profiles_select on profiles;
create policy profiles_select on profiles
  for select
  using (id = (select auth.uid()) or (select is_staff()));

drop policy shipments_select on shipments;
create policy shipments_select on shipments
  for select
  using (
    customer_id = (select auth.uid())
    or driver_id = (select auth.uid())
    or (select is_staff())
    or business_account_id in (
      select business_account_id from business_account_members where profile_id = (select auth.uid())
    )
  );

drop policy shipment_status_history_select on shipment_status_history;
create policy shipment_status_history_select on shipment_status_history
  for select
  using (
    (select is_staff())
    or shipment_id in (
      select id from shipments where customer_id = (select auth.uid()) or driver_id = (select auth.uid())
    )
  );

drop policy driver_locations_select on driver_locations;
create policy driver_locations_select on driver_locations
  for select
  using (
    driver_id = (select auth.uid())
    or (select is_staff())
    or shipment_id in (select id from shipments where customer_id = (select auth.uid()))
  );

drop policy payments_select on payments;
create policy payments_select on payments
  for select
  using (customer_id = (select auth.uid()) or (select is_staff()));

drop policy cod_transactions_select on cod_transactions;
create policy cod_transactions_select on cod_transactions
  for select
  using (driver_id = (select auth.uid()) or (select is_staff()));

drop policy notifications_select on notifications;
create policy notifications_select on notifications
  for select using (profile_id = (select auth.uid()));

drop policy support_tickets_select on support_tickets;
create policy support_tickets_select on support_tickets
  for select using (profile_id = (select auth.uid()) or (select is_staff()));

drop policy support_ticket_messages_select on support_ticket_messages;
create policy support_ticket_messages_select on support_ticket_messages
  for select
  using (
    (select is_staff())
    or ticket_id in (select id from support_tickets where profile_id = (select auth.uid()))
  );

drop policy audit_logs_select on audit_logs;
create policy audit_logs_select on audit_logs
  for select using ((select is_staff()));

drop policy business_accounts_select on business_accounts;
create policy business_accounts_select on business_accounts
  for select
  using (
    (select is_staff())
    or id in (select business_account_id from business_account_members where profile_id = (select auth.uid()))
  );

drop policy business_account_members_select on business_account_members;
create policy business_account_members_select on business_account_members
  for select
  using ((select is_staff()) or profile_id = (select auth.uid()));

drop policy shipment_batches_select on shipment_batches;
create policy shipment_batches_select on shipment_batches
  for select
  using (
    customer_id = (select auth.uid())
    or (select is_staff())
    or business_account_id in (
      select business_account_id from business_account_members where profile_id = (select auth.uid())
    )
  );

-- ── 2. Indexes ───────────────────────────────────────────────────────────

-- The primary key is (business_account_id, profile_id), which can't serve
-- the "which businesses am I in" lookup every customer shipment read runs.
create index business_account_members_profile_idx on business_account_members (profile_id);

-- Newest-first lists: staff shipment list, customer deliveries, driver
-- history. The per-owner composites replace the single-column ones.
create index shipments_created_at_idx on shipments (created_at desc);
create index shipments_customer_created_idx on shipments (customer_id, created_at desc);
drop index shipments_customer_idx;
create index shipments_driver_created_idx on shipments (driver_id, created_at desc);
drop index shipments_driver_idx;

-- The dispatch queue (confirmed, no driver yet), read on every operator
-- dashboard load and every realtime refresh.
create index shipments_dispatch_queue_idx on shipments (created_at) where status = 'confirmed' and driver_id is null;

create index shipment_status_history_shipment_created_idx on shipment_status_history (shipment_id, created_at);
drop index shipment_status_history_shipment_idx;

create index cod_transactions_created_idx on cod_transactions (created_at desc);
create index cod_transactions_driver_created_idx on cod_transactions (driver_id, created_at desc);
drop index cod_transactions_driver_idx;
create index payments_created_idx on payments (created_at desc);

-- ── 3. Aggregate views ───────────────────────────────────────────────────
-- security_invoker = true: the view runs with the caller's permissions, so
-- shipments RLS still applies — a customer querying these sees only
-- aggregates over shipments they could already read.

create view customer_shipment_stats with (security_invoker = true) as
select
  customer_id,
  count(*)::integer as shipment_count,
  coalesce(sum(price) filter (where payment_status = 'paid'), 0)::numeric(12, 2) as total_paid,
  -- What the customer dashboard calls "spent": paid upfront, or COD
  -- handed over on a completed delivery.
  coalesce(
    sum(price) filter (where payment_status = 'paid' or (payment_method = 'cod' and status = 'delivered')),
    0
  )::numeric(12, 2) as total_spent,
  min(currency) as currency
from shipments
group by customer_id;

-- Day/week/month boundaries are UAE calendar days, not the server's.
create view driver_shipment_stats with (security_invoker = true) as
select
  driver_id,
  count(*) filter (
    where created_at >= date_trunc('day', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai'
  )::integer as today_count,
  count(*) filter (
    where created_at >= date_trunc('week', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai'
  )::integer as week_count,
  count(*) filter (
    where created_at >= date_trunc('month', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai'
  )::integer as month_count,
  count(*) filter (where status = 'delivered')::integer as delivered_count,
  count(*) filter (where status = 'delivery_failed')::integer as failed_count,
  count(*) filter (
    where status in ('assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination')
  )::integer as active_count
from shipments
where driver_id is not null
group by driver_id;

create view driver_cod_stats with (security_invoker = true) as
select
  driver_id,
  coalesce(sum(amount), 0)::numeric(12, 2) as collected_total
from cod_transactions
where driver_id is not null and status in ('collected', 'reconciled', 'remitted')
group by driver_id;

create view batch_shipment_stats with (security_invoker = true) as
select
  batch_id,
  count(*)::integer as shipment_count,
  coalesce(sum(package_quantity), 0)::integer as parcel_count,
  coalesce(sum(price), 0)::numeric(12, 2) as total_price,
  min(currency) as currency,
  count(*) filter (where status in ('pending_payment', 'confirmed'))::integer as awaiting_dispatch,
  count(*) filter (
    where status in ('assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination')
  )::integer as in_progress,
  count(*) filter (where status = 'delivered')::integer as delivered,
  count(*) filter (where status in ('delivery_failed', 'cancelled', 'returned'))::integer as issues
from shipments
where batch_id is not null
group by batch_id;

-- Same billed/outstanding/COD rules the business account page used to
-- compute in JavaScript: cancelled shipments are never billed, and COD is
-- settled once delivered.
create view business_shipment_stats with (security_invoker = true) as
select
  business_account_id,
  count(*)::integer as shipment_count,
  coalesce(sum(price) filter (where status <> 'cancelled'), 0)::numeric(12, 2) as billed,
  coalesce(
    sum(price) filter (
      where status <> 'cancelled'
        and payment_status <> 'paid'
        and not (payment_method = 'cod' and status = 'delivered')
    ),
    0
  )::numeric(12, 2) as outstanding,
  coalesce(sum(price) filter (where status <> 'cancelled' and payment_method = 'cod'), 0)::numeric(12, 2) as cod
from shipments
where business_account_id is not null
group by business_account_id;

create view cod_status_totals with (security_invoker = true) as
select status, coalesce(sum(amount), 0)::numeric(12, 2) as total
from cod_transactions
group by status;

grant select on customer_shipment_stats, driver_shipment_stats, driver_cod_stats, batch_shipment_stats, business_shipment_stats,
  cod_status_totals
  to authenticated;
revoke all on customer_shipment_stats, driver_shipment_stats, driver_cod_stats, batch_shipment_stats, business_shipment_stats,
  cod_status_totals
  from anon;
