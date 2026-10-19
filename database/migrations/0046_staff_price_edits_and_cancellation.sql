-- Operators and managers change a booked shipment's price and cancel a
-- shipment from the dashboard.
--
-- Before this, staff could already do both with a plain client UPDATE
-- (enforce_shipment_update_permissions, 0015, let staff change anything but
-- 'delivered'), with no reason, no audit row, no stale-view check, and a
-- driver told the customer had cancelled. Both now go through one
-- SECURITY DEFINER function each, and the plain-update route is closed for
-- staff (customers keep their own cancel; drivers keep theirs, 0037).
--
-- ── Price ────────────────────────────────────────────────────────────────
--   What       shipments.price is the delivery fee, and the amount billed
--              (invoices, 0031) and earned (statements, 0044). It is the
--              sum of base + distance + weight + COD-handling charges. The
--              operator sets the delivery SERVICE charge (price minus the
--              weight and COD-handling charges — the invoice "subtotal");
--              weight and COD-handling charges stay as calculated, and the
--              difference from the calculated service charge is kept in the
--              new price_adjustment column so the breakdown still adds up.
--              cod_amount (the recipient's money for the goods) is never
--              touched: it is the merchant's, not ParcelLink's revenue.
--   Limits     AED 0 – 10,000, at most two decimals. Reason 5–500 chars.
--   When       not once the shipment is delivered, cancelled or returned
--              (its revenue is then reported / on a statement); not once
--              the fee has been paid (payment_status paid/refunded or a
--              paid payments row) or collected in cash (a cod_transactions
--              row carrying the fee that is no longer 'expected'); not if
--              the shipment is on a merchant statement. There is no refund
--              or extra-charge workflow to absorb a change after money moved.
--   Effects    in one transaction: price, price_adjustment; the driver's
--              still-'expected' cash record follows the new fee (never a
--              collected one); any live invoice covering the shipment (its
--              own or its bulk invoice) is voided with the reason — the
--              customer issues a corrected one, both stay on record (0031);
--              the customer is notified; one audit_logs row.
--
-- ── Cancellation ─────────────────────────────────────────────────────────
--   When       pending_payment, confirmed, assigned, driver_accepted,
--              arrived_pickup — every status the state machine lets reach
--              'cancelled' (no transition rows are added). Once picked up
--              the parcel is physically with the driver and is returned to
--              the sender (driver_return_shipment, 0037); a failed delivery
--              is marked returned (Mark returned). Delivered / cancelled /
--              returned are terminal.
--   Effects    status 'cancelled' + cancelled_reason. driver_id is kept, so
--              history still shows who held it; the shipment leaves the
--              driver's active work because every active list and count is
--              by status. The existing COD trigger (0022) drops only the
--              still-'expected' cash record; collected cash stays in the
--              driver's balance (0042). Payments, invoices and statements
--              are untouched: a paid fee is flagged as needing a refund,
--              never marked refunded. The customer and the driver get one
--              notification each; one audit_logs row.
--
-- ── Both ─────────────────────────────────────────────────────────────────
--   Who        operators and managers with an active profile, from the
--              session (never the request). No facility/tenant layer exists
--              (see README), so an operator's scope is every shipment.
--   Staleness  the caller passes what they saw (status, and the price for a
--              price change); anything else is refused with "reload".
--   Repeats    a client request id: the same request again returns the
--              first result without a second change, notification or audit.

-- ── 1. The adjustment column ─────────────────────────────────────────────
alter table shipments
  add column price_adjustment numeric(10, 2) not null default 0;

-- Price-change and cancellation history per shipment, newest first.
create index audit_logs_shipment_actions_idx on audit_logs (entity_id, created_at desc)
  where entity_type = 'shipment' and action in ('shipment.price_adjusted', 'shipment.cancelled_by_staff');

-- ── 2. Plain client updates: staff can no longer change money or cancel ──
-- As 0015, with the staff branch narrowed. SECURITY INVOKER on purpose
-- (current_user tells a client session from trusted code).
create or replace function enforce_shipment_update_permissions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  masked shipments%rowtype;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    raise exception 'Deliveries can only be completed through proof of delivery';
  end if;

  if is_staff() then
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      raise exception 'Cancel shipments with the Cancel shipment action';
    end if;
    if new.price is distinct from old.price
      or new.price_adjustment is distinct from old.price_adjustment
      or new.base_charge is distinct from old.base_charge
      or new.distance_charge is distinct from old.distance_charge
      or new.weight_charge is distinct from old.weight_charge
      or new.cod_charge is distinct from old.cod_charge
      or new.cod_amount is distinct from old.cod_amount
      or new.recipient_payment_type is distinct from old.recipient_payment_type
      or new.payment_method is distinct from old.payment_method
      or new.currency is distinct from old.currency
    then
      raise exception 'Prices can only be changed with the Edit price action';
    end if;
    return new;
  end if;

  masked := new;
  masked.updated_at := old.updated_at;

  if old.driver_id = auth.uid() then
    if new.status is distinct from old.status and new.status not in (
      'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivery_failed'
    ) then
      raise exception 'Drivers cannot set status %', new.status;
    end if;
    masked.status := old.status;
    masked.delivery_failed_reason := old.delivery_failed_reason;
    if masked is distinct from old then
      raise exception 'Drivers may only update delivery status and failure reason';
    end if;
    return new;
  end if;

  if old.customer_id = auth.uid() then
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'Customers can only cancel a shipment';
    end if;
    masked.status := old.status;
    masked.cancelled_reason := old.cancelled_reason;
    if masked is distinct from old then
      raise exception 'Customers may only cancel a shipment';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update this shipment';
end;
$$;

-- ── 3. The rules, in one place ───────────────────────────────────────────
-- Why a price can't be changed now (null = it can). Codes, not sentences:
-- the app shows them in the reader's language.
create function shipment_price_edit_block(p_shipment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.status in ('delivered', 'cancelled', 'returned') then 'closed'
    when s.payment_status in ('paid', 'refunded')
      or exists (select 1 from payments p where p.shipment_id = s.id and p.status in ('paid', 'refunded'))
      then 'fee_paid'
    when exists (
      select 1 from cod_transactions c
      where c.shipment_id = s.id and c.status <> 'expected' and coalesce(c.delivery_fee_amount, c.amount) > 0
    ) then 'fee_collected'
    when exists (select 1 from merchant_statement_lines l where l.shipment_id = s.id) then 'on_statement'
  end
  from shipments s
  where s.id = p_shipment_id;
$$;

-- Why a shipment can't be cancelled here (null = it can).
create function shipment_cancel_block(p_status shipment_status)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_status in ('pending_payment', 'confirmed', 'assigned', 'driver_accepted', 'arrived_pickup') then null
    when p_status in ('picked_up', 'in_transit', 'arrived_destination') then 'picked_up'
    when p_status = 'delivery_failed' then 'delivery_failed'
    when p_status = 'delivered' then 'delivered'
    when p_status = 'returned' then 'returned'
    else 'cancelled'
  end;
$$;

-- The live invoice that bills this shipment: its own, or its bulk invoice.
create function shipment_live_invoice(p_shipment_id uuid)
returns table (id uuid, invoice_number text)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.invoice_number
  from invoices i
  where i.status = 'issued'
    and (
      i.shipment_id = p_shipment_id
      or i.id in (select l.invoice_id from invoice_line_items l where l.shipment_id = p_shipment_id)
    );
$$;

-- What the dialogs show: what is allowed, and the money already attached.
-- Staff only; anyone else gets null.
create function shipment_staff_actions(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ship shipments%rowtype;
begin
  if not is_staff() then
    return null;
  end if;
  select * into v_ship from shipments where id = p_shipment_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'priceEditBlock', shipment_price_edit_block(v_ship.id),
    'cancelBlock', shipment_cancel_block(v_ship.status),
    'serviceCharge', v_ship.price - coalesce(v_ship.weight_charge, 0) - coalesce(v_ship.cod_charge, 0),
    'feePaid', v_ship.payment_status = 'paid'
      or exists (select 1 from payments p where p.shipment_id = v_ship.id and p.status = 'paid'),
    'cashCollected', coalesce((
      select sum(coalesce(c.collected_amount, c.amount)) from cod_transactions c
      where c.shipment_id = v_ship.id and c.status <> 'expected'
    ), 0),
    'cashExpected', coalesce((
      select sum(c.amount) from cod_transactions c where c.shipment_id = v_ship.id and c.status = 'expected'
    ), 0),
    'invoiceNumber', (select invoice_number from shipment_live_invoice(v_ship.id) limit 1)
  );
end;
$$;

-- ── 4. Changing the price ────────────────────────────────────────────────
create function staff_adjust_shipment_price(
  p_shipment_id uuid,
  p_expected_status shipment_status,
  p_expected_price numeric,
  p_new_service_charge numeric,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := current_app_role();
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ship shipments%rowtype;
  v_old_service numeric(10, 2);
  v_new_price numeric(10, 2);
  v_block text;
  v_cod cod_transactions%rowtype;
  v_invoice record;
  v_voided text[] := '{}';
  v_previous jsonb;
begin
  if v_actor is null or v_role is null or v_role not in ('operator', 'manager')
    or not exists (select 1 from profiles where id = v_actor and active and deleted_at is null)
  then
    raise exception 'Only operators and managers can change a shipment''s price';
  end if;
  if p_request_id is null then
    raise exception 'Missing request id';
  end if;
  if p_new_service_charge is null or not (p_new_service_charge between 0 and 10000) then
    raise exception 'Enter a delivery charge between AED 0 and AED 10,000';
  end if;
  if p_new_service_charge <> round(p_new_service_charge, 2) then
    raise exception 'Use at most two decimal places';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Give a reason for the price change (5 to 500 characters)';
  end if;

  select * into v_ship from shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'Shipment not found';
  end if;

  -- The same request again (a double click, a retry after a timeout):
  -- report what it did the first time, change nothing.
  select new_value into v_previous
  from audit_logs
  where entity_type = 'shipment' and entity_id = p_shipment_id
    and action = 'shipment.price_adjusted' and new_value ->> 'requestId' = p_request_id::text;
  if v_previous is not null then
    return v_previous;
  end if;

  if v_ship.status is distinct from p_expected_status or v_ship.price is distinct from round(p_expected_price, 2) then
    raise exception 'This shipment changed since you opened it — reload and try again';
  end if;

  v_block := shipment_price_edit_block(v_ship.id);
  if v_block = 'closed' then
    raise exception 'A delivered, cancelled or returned shipment''s price can''t be changed';
  elsif v_block = 'fee_paid' then
    raise exception 'The delivery fee has already been paid, so the price can''t be changed here';
  elsif v_block = 'fee_collected' then
    raise exception 'The driver has already collected the delivery fee, so the price can''t be changed here';
  elsif v_block = 'on_statement' then
    raise exception 'This shipment is on a merchant statement, so the price can''t be changed here';
  end if;

  v_old_service := v_ship.price - coalesce(v_ship.weight_charge, 0) - coalesce(v_ship.cod_charge, 0);
  v_new_price := p_new_service_charge + coalesce(v_ship.weight_charge, 0) + coalesce(v_ship.cod_charge, 0);
  if v_new_price = v_ship.price then
    raise exception 'The price is unchanged';
  end if;

  update shipments
  set price = v_new_price,
      price_adjustment = price_adjustment + (p_new_service_charge - v_old_service)
  where id = v_ship.id;

  -- The cash the driver will collect from the sender follows the new fee —
  -- only while nothing has been collected (the block above guarantees the
  -- fee isn't on a collected row). Same rules as the 0022 sync trigger,
  -- which doesn't fire on a price change: no record for nothing to collect.
  if v_ship.payment_method = 'cod' then
    select * into v_cod from cod_transactions
    where shipment_id = v_ship.id and status = 'expected'
    for update;
    if found then
      if v_cod.product_amount + v_new_price = 0 then
        delete from cod_transactions where id = v_cod.id;
      else
        update cod_transactions
        set delivery_fee_amount = v_new_price,
            amount = v_cod.product_amount + v_new_price
        where id = v_cod.id;
      end if;
    elsif v_ship.driver_id is not null and v_new_price > 0
      and not exists (select 1 from cod_transactions where shipment_id = v_ship.id)
    then
      insert into cod_transactions (shipment_id, driver_id, customer_id, amount, product_amount, delivery_fee_amount, status)
      values (
        v_ship.id, v_ship.driver_id, v_ship.customer_id,
        case when v_ship.recipient_payment_type = 'postpaid' then v_ship.cod_amount else 0 end + v_new_price,
        case when v_ship.recipient_payment_type = 'postpaid' then v_ship.cod_amount else 0 end,
        v_new_price, 'expected'
      );
    end if;
  end if;

  -- An issued invoice is a snapshot of the old price. Void it (the 0031
  -- hook for an audited regeneration); the customer issues a corrected one.
  for v_invoice in select * from shipment_live_invoice(v_ship.id) loop
    update invoices
    set status = 'void',
        voided_at = now(),
        void_reason = left(format('Price of %s changed from AED %s to AED %s: %s',
          v_ship.tracking_number, v_ship.price, v_new_price, v_reason), 500)
    where id = v_invoice.id;
    v_voided := v_voided || v_invoice.invoice_number;
  end loop;

  insert into notifications (profile_id, type, title, body)
  values (
    v_ship.customer_id, 'shipment.price_adjusted', 'Delivery price updated',
    'The delivery price for ' || v_ship.tracking_number || ' changed from AED '
      || to_char(v_ship.price, 'FM999999990.00') || ' to AED ' || to_char(v_new_price, 'FM999999990.00') || '.'
  );

  v_previous := jsonb_build_object(
    'requestId', p_request_id,
    'field', 'service_charge',
    'price', v_new_price,
    'serviceCharge', p_new_service_charge,
    'reason', v_reason,
    'status', v_ship.status,
    'paymentMethod', v_ship.payment_method,
    'expectedCash', (select amount from cod_transactions where shipment_id = v_ship.id and status = 'expected' limit 1),
    'voidedInvoices', to_jsonb(v_voided)
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_actor, 'shipment.price_adjusted', 'shipment', v_ship.id,
    jsonb_build_object(
      'price', v_ship.price,
      'serviceCharge', v_old_service,
      'priceAdjustment', v_ship.price_adjustment,
      'codAmount', v_ship.cod_amount,
      'paymentStatus', v_ship.payment_status,
      'expectedCash', case when v_cod.id is not null then v_cod.amount end
    ),
    v_previous
  );

  return v_previous;
end;
$$;

-- ── 5. Cancelling ────────────────────────────────────────────────────────
create function staff_cancel_shipment(
  p_shipment_id uuid,
  p_expected_status shipment_status,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := current_app_role();
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ship shipments%rowtype;
  v_block text;
  v_previous jsonb;
  v_fee_paid boolean;
  v_cash_collected numeric(12, 2);
  v_cash_expected numeric(12, 2);
  v_invoice text;
begin
  if v_actor is null or v_role is null or v_role not in ('operator', 'manager')
    or not exists (select 1 from profiles where id = v_actor and active and deleted_at is null)
  then
    raise exception 'Only operators and managers can cancel a shipment here';
  end if;
  if p_request_id is null then
    raise exception 'Missing request id';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Give a reason for the cancellation (5 to 500 characters)';
  end if;

  select * into v_ship from shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'Shipment not found';
  end if;

  select new_value into v_previous
  from audit_logs
  where entity_type = 'shipment' and entity_id = p_shipment_id
    and action = 'shipment.cancelled_by_staff' and new_value ->> 'requestId' = p_request_id::text;
  if v_previous is not null then
    return v_previous;
  end if;

  if v_ship.status is distinct from p_expected_status then
    raise exception 'This shipment changed since you opened it — reload and try again';
  end if;

  v_block := shipment_cancel_block(v_ship.status);
  if v_block = 'picked_up' then
    raise exception 'This parcel has been picked up. The driver must return it to the sender instead';
  elsif v_block = 'delivery_failed' then
    raise exception 'This delivery failed. Mark it returned instead of cancelling it';
  elsif v_block = 'delivered' then
    raise exception 'Delivered shipments can''t be cancelled';
  elsif v_block = 'returned' then
    raise exception 'Returned shipments can''t be cancelled';
  elsif v_block = 'cancelled' then
    raise exception 'This shipment is already cancelled';
  end if;

  -- Money already attached, recorded as it was before the change.
  v_fee_paid := v_ship.payment_status = 'paid'
    or exists (select 1 from payments p where p.shipment_id = v_ship.id and p.status = 'paid');
  select
    coalesce(sum(coalesce(collected_amount, amount)) filter (where status <> 'expected'), 0),
    coalesce(sum(amount) filter (where status = 'expected'), 0)
  into v_cash_collected, v_cash_expected
  from cod_transactions where shipment_id = v_ship.id;
  select invoice_number into v_invoice from shipment_live_invoice(v_ship.id) limit 1;

  perform set_config('app.staff_cancellation', 'on', true);
  update shipments set status = 'cancelled', cancelled_reason = v_reason where id = v_ship.id;
  perform set_config('app.staff_cancellation', '', true);

  v_previous := jsonb_build_object(
    'requestId', p_request_id,
    'status', 'cancelled',
    'reason', v_reason,
    'driverId', v_ship.driver_id,
    'refundRequired', v_fee_paid,
    'cashCollected', v_cash_collected,
    'expectedCashCleared', v_cash_expected,
    'invoiceNumber', v_invoice
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_actor, 'shipment.cancelled_by_staff', 'shipment', v_ship.id,
    jsonb_build_object(
      'status', v_ship.status,
      'driverId', v_ship.driver_id,
      'paymentStatus', v_ship.payment_status,
      'price', v_ship.price,
      'codAmount', v_ship.cod_amount
    ),
    v_previous
  );

  return v_previous;
end;
$$;

-- ── 6. Notifications for a staff cancellation ────────────────────────────
-- As 0041, plus one branch: a cancellation by operations tells the customer
-- and the driver who cancelled it (not "the customer").
create or replace function notify_shipment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by_driver boolean := old.driver_id is not null and old.driver_id = auth.uid();
  v_correction boolean := nullif(current_setting('app.status_correction_reason', true), '') is not null;
  v_by_staff boolean := nullif(current_setting('app.staff_cancellation', true), '') is not null;
begin
  if new.status is distinct from old.status and not v_correction then
    if new.status = 'confirmed' and old.status = 'pending_payment' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'payment.success', 'Payment successful', 'Payment for ' || new.tracking_number || ' was received.');
      perform notify_operators(
        'shipment.ready_for_dispatch', 'New shipment ready for dispatch',
        new.tracking_number || ' is confirmed and awaiting a driver.'
      );

    elsif new.status = 'confirmed' and old.status = 'assigned' then
      perform notify_operators(
        'shipment.driver_declined', 'Driver declined an assignment',
        new.tracking_number || ' needs a new driver.'
      );

    elsif new.status = 'arrived_pickup' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.driver_arriving', 'Driver arriving', 'Your driver has arrived for pickup of ' || new.tracking_number || '.');

    elsif new.status = 'picked_up' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.picked_up', 'Parcel picked up', new.tracking_number || ' has been picked up.');

    elsif new.status = 'in_transit' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.in_transit', 'Parcel in transit', new.tracking_number || ' is on its way.');

    elsif new.status = 'delivered' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.delivered', 'Delivery completed', new.tracking_number || ' has been delivered.');

    elsif new.status = 'delivery_failed' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.delivery_failed', 'Delivery failed', 'A delivery attempt for ' || new.tracking_number || ' failed.');
      perform notify_operators(
        'shipment.delivery_failed', 'Delivery failed — needs attention',
        new.tracking_number || ' failed delivery and needs action.'
      );

    elsif new.status = 'cancelled' and v_by_staff then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.cancelled_by_operations', 'Shipment cancelled', new.tracking_number || ' was cancelled by ParcelLink operations.');
      if old.driver_id is not null then
        insert into notifications (profile_id, type, title, body)
        values (old.driver_id, 'shipment.cancelled_by_operations', 'Delivery cancelled', new.tracking_number || ' was cancelled by operations and is no longer on your deliveries.');
      end if;

    elsif new.status = 'cancelled' and v_by_driver then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.cancelled_by_driver', 'Shipment cancelled', new.tracking_number || ' was cancelled by the driver.');
      perform notify_operators(
        'shipment.cancelled_by_driver', 'Driver cancelled a shipment',
        new.tracking_number || ' was cancelled by the driver before pickup.'
      );

    elsif new.status = 'cancelled' and old.driver_id is not null then
      insert into notifications (profile_id, type, title, body)
      values (old.driver_id, 'shipment.cancelled', 'Delivery cancelled', new.tracking_number || ' was cancelled by the customer.');

    elsif new.status = 'returned' then
      insert into notifications (profile_id, type, title, body)
      values (new.customer_id, 'shipment.returned', 'Shipment returned', new.tracking_number || ' is being returned to the sender.');
      if v_by_driver then
        perform notify_operators(
          'shipment.returned', 'Driver returned a shipment',
          new.tracking_number || ' was not delivered and is being returned to the sender.'
        );
      end if;
    end if;
  end if;

  if new.driver_id is distinct from old.driver_id and new.driver_id is not null then
    insert into notifications (profile_id, type, title, body)
    values (new.driver_id, 'shipment.assigned', 'New delivery assigned', 'You''ve been assigned ' || new.tracking_number || '.');

    if old.driver_id is not null then
      insert into notifications (profile_id, type, title, body)
      values (old.driver_id, 'shipment.unassigned', 'Delivery reassigned', new.tracking_number || ' has been reassigned to another driver.');
    end if;
  end if;

  return new;
end;
$$;

-- ── 7. Grants ────────────────────────────────────────────────────────────
-- Helpers: internal only (Postgres grants EXECUTE to PUBLIC by default).
revoke execute on function shipment_price_edit_block(uuid) from public, anon, authenticated;
revoke execute on function shipment_live_invoice(uuid) from public, anon, authenticated;
revoke execute on function shipment_cancel_block(shipment_status) from public, anon;
grant execute on function shipment_cancel_block(shipment_status) to authenticated;

revoke execute on function shipment_staff_actions(uuid) from public, anon;
grant execute on function shipment_staff_actions(uuid) to authenticated;
revoke execute on function staff_adjust_shipment_price(uuid, shipment_status, numeric, numeric, text, uuid) from public, anon;
grant execute on function staff_adjust_shipment_price(uuid, shipment_status, numeric, numeric, text, uuid) to authenticated;
revoke execute on function staff_cancel_shipment(uuid, shipment_status, text, uuid) from public, anon;
grant execute on function staff_cancel_shipment(uuid, shipment_status, text, uuid) to authenticated;
