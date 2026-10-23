-- Invoices for guest bookings: shipments an operator booked for a customer
-- with no ParcelLink account (WhatsApp, telephone, walk-in; migration 0040).
--
-- ── Why they had none ────────────────────────────────────────────────────
-- A guest booking has no customer_id (0040), but
--   * invoices.customer_id was NOT NULL (0031);
--   * issue_shipment_invoice() let only the booking customer, or a member
--     of the business account, issue an invoice — and a guest has no login,
--     while staff could only read invoices;
-- so no one could ever invoice one.
--
-- ── Now ──────────────────────────────────────────────────────────────────
-- issue_shipment_invoice() also lets an ACTIVE operator or manager issue the
-- invoice of a guest booking (staff already see every shipment: there is no
-- per-operator scope, 0049). Registered customers' shipments are unchanged:
-- their own customer or business issues them, as before, and staff read
-- them. A guest invoice is
--   invoice_type  'individual_shipment' — a guest is priced as an
--                 individual (0040); nothing is re-priced here;
--   customer_id   null (no fake account is created);
--   billed_to     the guest's name and phone as booked, marked walkIn.
-- Everything else is the 0031 snapshot, from the same stored, price-checked
-- columns, with the same advisory lock and "one live invoice per shipment"
-- index: issuing again (a retry, a second click, another download) returns
-- the same invoice and charges nothing. Edits and cancellations follow the
-- existing policy (0046 voids the invoice; a new one can then be issued).
--
-- ── COD ──────────────────────────────────────────────────────────────────
-- invoice_line_items.cod_amount: the cash the driver collects from the
-- recipient for the goods, on behalf of the sender. It is NOT a ParcelLink
-- charge — not in any line amount or the invoice total — and is shown
-- apart. Snapshotted for invoices issued from now on (shipment and bulk);
-- null on earlier invoices, which simply don't show it.
--
-- ── Payment state ────────────────────────────────────────────────────────
-- invoice_payment_state(): what the payment records say NOW about a
-- single-shipment invoice — read live, never stored on the invoice, and
-- never written by issuing or downloading one:
--   paid               shipments.payment_status = 'paid' or a paid payment
--   refunded           shipments.payment_status = 'refunded'
--   billed_to_account  the fee is billed to the merchant account (0050)
--   cash_collected     a driver's verified cash collection (0042) covered
--                      the delivery fee
--   cancelled          the shipment was cancelled
--   unpaid             none of the above: the total is due
-- Only someone who can read the invoice gets an answer.

-- ── 1. Columns ───────────────────────────────────────────────────────────
alter table invoices alter column customer_id drop not null;

alter table invoices
  add constraint invoices_customer_or_guest check (
    customer_id is not null
    or (invoice_type = 'individual_shipment' and shipment_id is not null and business_account_id is null)
  );

alter table invoice_line_items
  add column cod_amount numeric(10, 2) check (cod_amount is null or cod_amount >= 0);

-- ── 2. Issuing a shipment invoice ────────────────────────────────────────
-- As 0031, plus the guest branch and the COD snapshot.
create or replace function issue_shipment_invoice(p_shipment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ship shipments%rowtype;
  v_account account_type;
  v_merchant boolean;
  v_guest boolean;
  v_existing text;
  v_invoice_id uuid := gen_random_uuid();
  v_number text;
  v_additional numeric(10, 2);
  v_service numeric(10, 2);
  v_billed_to jsonb;
begin
  select * into v_ship from shipments where id = p_shipment_id;
  v_guest := found and v_ship.customer_id is null;
  -- Someone who may not bill this shipment learns nothing about it.
  -- coalesce: with no customer_id, invoice_caller_may_issue() is NULL, not
  -- false, and "not NULL" would let anyone through.
  if not found
    or not coalesce(
      invoice_caller_may_issue(v_ship.customer_id, v_ship.business_account_id)
      or (
        v_guest
        and exists (
          select 1 from profiles
          where id = auth.uid() and role in ('operator', 'manager') and active and deleted_at is null
        )
      ),
      false
    )
  then
    raise exception 'Shipment not found';
  end if;

  -- Two clicks at once still produce one invoice.
  perform pg_advisory_xact_lock(hashtextextended('invoice:shipment:' || p_shipment_id::text, 0));

  select invoice_number into v_existing from invoices where shipment_id = p_shipment_id and status = 'issued';
  if v_existing is not null then
    return v_existing;
  end if;

  if v_ship.status = 'cancelled' then
    raise exception 'A cancelled shipment cannot be invoiced';
  end if;

  if v_guest then
    v_merchant := false;
    v_billed_to := jsonb_strip_nulls(jsonb_build_object(
      'name', btrim(v_ship.guest_customer_name),
      'phone', nullif(btrim(coalesce(v_ship.guest_customer_phone, '')), ''),
      'walkIn', true
    ));
  else
    select account_type into v_account from profiles where id = v_ship.customer_id;
    v_merchant := v_account = 'merchant';
    v_billed_to := invoice_billed_to(v_ship.customer_id, v_ship.business_account_id, v_merchant);
  end if;

  if v_merchant and v_ship.batch_id is not null then
    raise exception 'This shipment is billed on its bulk shipment invoice';
  end if;

  -- The stored price is the amount billed. Weight and COD handling are the
  -- additional charges; the rest of the price is the delivery service.
  v_additional := coalesce(v_ship.weight_charge, 0) + coalesce(v_ship.cod_charge, 0);
  v_service := v_ship.price - v_additional;
  if v_service < 0 then
    raise exception 'This shipment''s charges are inconsistent and cannot be invoiced';
  end if;

  v_number := next_invoice_number();

  insert into invoices (
    id, invoice_number, invoice_type, customer_id, business_account_id, shipment_id,
    billed_to, reference, shipment_count, subtotal, additional_charges, discount_total, total, currency, issued_by
  ) values (
    v_invoice_id, v_number,
    case when v_merchant then 'merchant_shipment' else 'individual_shipment' end,
    v_ship.customer_id, case when v_guest then null else v_ship.business_account_id end, v_ship.id,
    v_billed_to,
    v_ship.tracking_number, 1, v_service, v_additional, 0, v_ship.price, v_ship.currency, auth.uid()
  );

  insert into invoice_line_items (
    invoice_id, line_number, shipment_id, tracking_number, booked_at, pickup_address, dropoff_address,
    recipient_name, delivery_type, package_type, description, quantity, weight_kg, distance_km, payment_method,
    base_charge, distance_charge, service_charge, weight_charge, cod_charge, amount, currency, cod_amount
  ) values (
    v_invoice_id, 1, v_ship.id, v_ship.tracking_number, v_ship.created_at, v_ship.pickup_address, v_ship.dropoff_address,
    v_ship.dropoff_contact_name, v_ship.delivery_type, v_ship.package_type, v_ship.package_description,
    v_ship.package_quantity, v_ship.package_weight_kg, v_ship.distance_km, v_ship.payment_method,
    v_ship.base_charge, v_ship.distance_charge, v_service,
    coalesce(v_ship.weight_charge, 0), coalesce(v_ship.cod_charge, 0), v_ship.price, v_ship.currency,
    coalesce(v_ship.cod_amount, 0)
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (auth.uid(), 'invoice.issued', 'invoice', v_invoice_id,
    jsonb_build_object('invoiceNumber', v_number, 'shipmentId', v_ship.id, 'total', v_ship.price, 'currency', v_ship.currency, 'guest', v_guest));

  return v_number;
end;
$$;

-- ── 3. Bulk invoices snapshot COD too ────────────────────────────────────
-- As 0031, with cod_amount on each line.
create or replace function issue_batch_invoice(p_batch_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch shipment_batches%rowtype;
  v_account account_type;
  v_existing text;
  v_invoice_id uuid := gen_random_uuid();
  v_number text;
  v_count integer;
  v_subtotal numeric(12, 2);
  v_additional numeric(12, 2);
  v_total numeric(12, 2);
  v_currencies integer;
  v_currency text;
  v_pickups integer;
  v_pickup text;
  v_lines_total numeric(12, 2);
begin
  select * into v_batch from shipment_batches where id = p_batch_id;
  if not found or not invoice_caller_may_issue(v_batch.customer_id, v_batch.business_account_id) then
    raise exception 'Bulk shipment not found';
  end if;

  select account_type into v_account from profiles where id = v_batch.customer_id;
  if v_account <> 'merchant' then
    raise exception 'Bulk invoices are for merchant accounts';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('invoice:batch:' || p_batch_id::text, 0));

  select invoice_number into v_existing from invoices where batch_id = p_batch_id and status = 'issued';
  if v_existing is not null then
    return v_existing;
  end if;

  if v_batch.status not in ('submitted', 'partially_failed', 'failed') then
    raise exception 'This bulk shipment has not been booked yet';
  end if;

  -- Hold the batch's shipments still until the invoice is written, so the
  -- totals and the lines are taken from exactly the same rows.
  perform 1 from shipments where batch_id = p_batch_id for share;

  select
    count(*)::integer,
    coalesce(sum(price - coalesce(weight_charge, 0) - coalesce(cod_charge, 0)), 0),
    coalesce(sum(coalesce(weight_charge, 0) + coalesce(cod_charge, 0)), 0),
    coalesce(sum(price), 0),
    count(distinct currency)::integer,
    min(currency),
    count(distinct pickup_address)::integer,
    min(pickup_address)
  into v_count, v_subtotal, v_additional, v_total, v_currencies, v_currency, v_pickups, v_pickup
  from shipments
  where batch_id = p_batch_id and status <> 'cancelled';

  if v_count = 0 then
    raise exception 'This bulk shipment has no shipments to invoice';
  end if;
  if v_currencies > 1 then
    raise exception 'This bulk shipment mixes currencies and cannot be invoiced';
  end if;
  if v_subtotal < 0 or exists (
    select 1 from shipments
    where batch_id = p_batch_id and status <> 'cancelled'
      and price < coalesce(weight_charge, 0) + coalesce(cod_charge, 0)
  ) then
    raise exception 'This shipment''s charges are inconsistent and cannot be invoiced';
  end if;

  v_number := next_invoice_number();

  insert into invoices (
    id, invoice_number, invoice_type, customer_id, business_account_id, batch_id,
    billed_to, reference, batch_name, pickup_address, shipment_count,
    subtotal, additional_charges, discount_total, total, currency, issued_by
  ) values (
    v_invoice_id, v_number, 'bulk_shipment', v_batch.customer_id, v_batch.business_account_id, v_batch.id,
    invoice_billed_to(v_batch.customer_id, v_batch.business_account_id, true),
    v_batch.reference, v_batch.name,
    -- The batch's own pickup (merchant uploads), else the one every shipment shares.
    coalesce(v_batch.pickup_address, case when v_pickups = 1 then v_pickup end),
    v_count, v_subtotal, v_additional, 0, v_total, v_currency, auth.uid()
  );

  insert into invoice_line_items (
    invoice_id, line_number, shipment_id, tracking_number, booked_at, pickup_address, dropoff_address,
    recipient_name, delivery_type, package_type, description, quantity, weight_kg, distance_km, payment_method,
    base_charge, distance_charge, service_charge, weight_charge, cod_charge, amount, currency, cod_amount
  )
  select
    v_invoice_id,
    row_number() over (order by s.created_at, s.id),
    s.id, s.tracking_number, s.created_at, s.pickup_address, s.dropoff_address,
    s.dropoff_contact_name, s.delivery_type, s.package_type, s.package_description,
    s.package_quantity, s.package_weight_kg, s.distance_km, s.payment_method,
    s.base_charge, s.distance_charge,
    s.price - coalesce(s.weight_charge, 0) - coalesce(s.cod_charge, 0),
    coalesce(s.weight_charge, 0), coalesce(s.cod_charge, 0), s.price, s.currency,
    coalesce(s.cod_amount, 0)
  from shipments s
  where s.batch_id = p_batch_id and s.status <> 'cancelled';

  -- Belt and braces: the header must equal its lines.
  select coalesce(sum(amount), 0) into v_lines_total from invoice_line_items where invoice_id = v_invoice_id;
  if v_lines_total <> v_total then
    raise exception 'Invoice total does not match its lines';
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
  values (auth.uid(), 'invoice.issued', 'invoice', v_invoice_id,
    jsonb_build_object('invoiceNumber', v_number, 'batchId', v_batch.id, 'shipments', v_count, 'total', v_total, 'currency', v_currency));

  return v_number;
end;
$$;

-- ── 4. Payment state ─────────────────────────────────────────────────────
create function invoice_payment_state(p_invoice_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
  v_ship shipments%rowtype;
  v_state text;
begin
  -- The invoices_select audience (0031), checked here because this
  -- function reads past RLS.
  select * into v_invoice from invoices i
  where i.invoice_number = p_invoice_number
    and auth.uid() is not null
    and (
      i.customer_id = auth.uid()
      or is_staff()
      or i.business_account_id in (select business_account_id from business_account_members where profile_id = auth.uid())
    );
  if not found or v_invoice.status = 'void' or v_invoice.shipment_id is null then
    return null;
  end if;

  select * into v_ship from shipments where id = v_invoice.shipment_id;
  if not found then
    return null;
  end if;

  if v_ship.payment_status = 'refunded' then
    v_state := 'refunded';
  elsif v_ship.payment_status = 'paid'
    or exists (select 1 from payments p where p.shipment_id = v_ship.id and p.status = 'paid') then
    v_state := 'paid';
  elsif v_ship.fee_billed then
    v_state := 'billed_to_account';
  elsif exists (
    select 1 from cod_transactions c
    where c.shipment_id = v_ship.id
      and c.delivery_fee_amount > 0
      and c.collected_amount is not null
      and c.collected_amount >= c.product_amount + c.delivery_fee_amount
  ) then
    v_state := 'cash_collected';
  elsif v_ship.status = 'cancelled' then
    v_state := 'cancelled';
  else
    v_state := 'unpaid';
  end if;

  return jsonb_build_object(
    'state', v_state,
    'amountDue', case when v_state = 'unpaid' then v_invoice.total else 0 end,
    'currency', v_invoice.currency,
    'checkedAt', now()
  );
end;
$$;

revoke execute on function invoice_payment_state(text) from public, anon;
grant execute on function invoice_payment_state(text) to authenticated;
