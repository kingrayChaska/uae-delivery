import { beforeEach, describe, expect, it, vi } from 'vitest';

// adjustShipmentPriceAction / staffCancelShipmentAction (migration 0046).
// The rules live in staff_adjust_shipment_price() / staff_cancel_shipment()
// and are covered by database/test/staff-price-cancel.sql; here: who may
// call them, what is validated before the database is asked, that what the
// operator saw and a request id go with every request (stale views and
// repeats are refused or deduplicated there), that no actor, total price
// or COD amount is ever sent, and that database refusals come back in words.

const SHIPMENT = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';

const role = vi.hoisted(() => ({ current: 'operator' as string }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/services/drivers/list-available-drivers', () => ({ listAvailableDrivers: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: 'staff', role: role.current };
  },
}));

const { adjustShipmentPriceAction, staffCancelShipmentAction } = await import('@/lib/dispatch/actions');

const priceEdit = {
  shipmentId: SHIPMENT,
  expectedStatus: 'confirmed' as const,
  expectedPrice: 21.6,
  serviceCharge: '30',
  reason: 'Negotiated corporate rate',
  requestId: REQUEST,
};

const cancel = {
  shipmentId: SHIPMENT,
  expectedStatus: 'assigned' as const,
  reason: 'Customer called to cancel',
  requestId: REQUEST,
};

beforeEach(() => {
  role.current = 'operator';
  rpc.mockReset();
});

describe('adjustShipmentPriceAction', () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: { price: '30.00', voidedInvoices: ['INV-2026-000004'] }, error: null });
  });

  it('sends what the operator saw, the service charge, the reason and the request id — and nothing else', async () => {
    expect(await adjustShipmentPriceAction(priceEdit)).toEqual({
      success: true,
      data: { price: 30, voidedInvoices: ['INV-2026-000004'] },
    });
    expect(rpc).toHaveBeenCalledWith('staff_adjust_shipment_price', {
      p_shipment_id: SHIPMENT,
      p_expected_status: 'confirmed',
      p_expected_price: 21.6,
      p_new_service_charge: 30,
      p_reason: 'Negotiated corporate rate',
      p_request_id: REQUEST,
    });
  });

  it('is open to managers', async () => {
    role.current = 'manager';
    expect((await adjustShipmentPriceAction(priceEdit)).success).toBe(true);
  });

  it.each(['driver', 'customer'])('refuses a %s before reaching the database', async (who) => {
    role.current = who;
    await expect(adjustShipmentPriceAction(priceEdit)).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['negative', '-5', 'operator.validation.priceFormat'],
    ['three decimals', '30.005', 'operator.validation.priceFormat'],
    ['malformed', '3O', 'operator.validation.priceFormat'],
    ['exponent', '1e3', 'operator.validation.priceFormat'],
    ['Infinity', 'Infinity', 'operator.validation.priceFormat'],
    ['NaN', 'NaN', 'operator.validation.priceFormat'],
    ['empty', '  ', 'operator.validation.priceRequired'],
    ['over the limit', '10000.01', 'operator.validation.priceRange'],
  ])('rejects a %s amount', async (_label, serviceCharge, error) => {
    expect(await adjustShipmentPriceAction({ ...priceEdit, serviceCharge })).toEqual({ success: false, error });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts zero (a waived fee) and two decimals', async () => {
    expect((await adjustShipmentPriceAction({ ...priceEdit, serviceCharge: '0' })).success).toBe(true);
    expect((await adjustShipmentPriceAction({ ...priceEdit, serviceCharge: '25.50' })).success).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith('staff_adjust_shipment_price', expect.objectContaining({ p_new_service_charge: 25.5 }));
  });

  it('requires a reason', async () => {
    expect(await adjustShipmentPriceAction({ ...priceEdit, reason: ' ok ' })).toEqual({
      success: false,
      error: 'operator.validation.priceReason',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires a request id and a real shipment id', async () => {
    expect((await adjustShipmentPriceAction({ ...priceEdit, requestId: 'again' })).success).toBe(false);
    expect((await adjustShipmentPriceAction({ ...priceEdit, shipmentId: '1 or 1=1' })).success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['This shipment changed since you opened it — reload and try again', 'errors.db.staffChangedSinceOpened'],
    ["The delivery fee has already been paid, so the price can't be changed here", 'errors.db.priceFeePaid'],
    ["The driver has already collected the delivery fee, so the price can't be changed here", 'errors.db.priceFeeCollected'],
    ["A delivered, cancelled or returned shipment's price can't be changed", 'errors.db.priceClosed'],
    ["Only operators and managers can change a shipment's price", 'errors.db.priceStaffOnly'],
  ])('reports "%s" in words', async (message, key) => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message } });
    expect(await adjustShipmentPriceAction(priceEdit)).toEqual({ success: false, error: key });
  });

  it('never reports success when the database refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for function staff_adjust_shipment_price' } });
    expect(await adjustShipmentPriceAction(priceEdit)).toEqual({ success: false, error: 'errors.forbidden' });
  });
});

describe('staffCancelShipmentAction', () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: { status: 'cancelled', refundRequired: true, cashCollected: '21.60' }, error: null });
  });

  it('sends the status the operator saw, the reason and the request id', async () => {
    expect(await staffCancelShipmentAction(cancel)).toEqual({
      success: true,
      data: { refundRequired: true, cashCollected: 21.6 },
    });
    expect(rpc).toHaveBeenCalledWith('staff_cancel_shipment', {
      p_shipment_id: SHIPMENT,
      p_expected_status: 'assigned',
      p_reason: 'Customer called to cancel',
      p_request_id: REQUEST,
    });
  });

  it.each(['driver', 'customer'])('refuses a %s before reaching the database', async (who) => {
    role.current = who;
    await expect(staffCancelShipmentAction(cancel)).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    expect(await staffCancelShipmentAction({ ...cancel, reason: '' })).toEqual({
      success: false,
      error: 'operator.validation.cancelReason',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a status that does not exist', async () => {
    expect((await staffCancelShipmentAction({ ...cancel, expectedStatus: 'lost' as never })).success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['This parcel has been picked up. The driver must return it to the sender instead', 'errors.db.cancelPickedUp'],
    ["Delivered shipments can't be cancelled", 'errors.db.cancelDelivered'],
    ['This shipment is already cancelled', 'errors.db.cancelAlready'],
    ['This shipment changed since you opened it — reload and try again', 'errors.db.staffChangedSinceOpened'],
  ])('reports "%s" in words', async (message, key) => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message } });
    expect(await staffCancelShipmentAction(cancel)).toEqual({ success: false, error: key });
  });
});
