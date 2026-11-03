import { beforeEach, describe, expect, it, vi } from 'vitest';

const SHIPMENT = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';

const shipment = vi.hoisted(() => ({
  id: '',
  status: 'pending_payment',
  driver_id: null as string | null,
  payment_method: 'card',
}));
const role = vi.hoisted(() => ({ current: 'operator' }));
const rpc = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn());
const shipmentUpdate = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: audit }));
vi.mock('@/services/drivers/list-available-drivers', () => ({ listAvailableDrivers: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: 'operator', role: role.current };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ...shipment }, error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        shipmentUpdate(values);
        const builder = {
          eq: () => builder,
          select: async () => ({ data: [{ id: SHIPMENT }], error: null }),
        };
        return builder;
      },
    }),
  }),
}));

const { operatorChangeShipmentStatusAction } = await import('@/lib/dispatch/actions');

const change = {
  shipmentId: SHIPMENT,
  expectedStatus: 'pending_payment' as const,
  status: 'pending' as const,
  reason: '',
  requestId: REQUEST,
};

beforeEach(() => {
  shipment.id = SHIPMENT;
  shipment.status = 'pending_payment';
  shipment.driver_id = null;
  shipment.payment_method = 'card';
  role.current = 'operator';
  rpc.mockReset().mockResolvedValue({ data: 'confirmed', error: null });
  audit.mockReset();
  shipmentUpdate.mockReset();
});

describe('operatorChangeShipmentStatusAction', () => {
  it('uses the existing cash-conversion workflow for an eligible pending-payment shipment', async () => {
    expect(await operatorChangeShipmentStatusAction(change)).toEqual({
      success: true,
      data: { status: 'pending', canonicalStatus: 'confirmed' },
    });
    expect(rpc).toHaveBeenCalledWith('switch_shipment_to_cash', { p_shipment_id: SHIPMENT });
  });

  it('recognizes an already pending, confirmed, unassigned shipment without changing it', async () => {
    shipment.status = 'confirmed';
    const result = await operatorChangeShipmentStatusAction({ ...change, expectedStatus: 'confirmed' });
    expect(result).toEqual({
      success: true,
      data: { status: 'pending', canonicalStatus: 'confirmed', unchanged: true },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects unsafe pending transitions', async () => {
    shipment.status = 'in_transit';
    const result = await operatorChangeShipmentStatusAction({ ...change, expectedStatus: 'in_transit' });
    expect(result).toEqual({
      success: false,
      error: 'operator.shipmentDetail.statusChange.pendingUnavailable',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not convert a payment-pending shipment that is already configured for cash', async () => {
    shipment.payment_method = 'cod';
    const result = await operatorChangeShipmentStatusAction(change);
    expect(result).toEqual({
      success: false,
      error: 'operator.shipmentDetail.statusChange.pendingUnavailable',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a stale page before applying Pending', async () => {
    shipment.status = 'confirmed';
    const result = await operatorChangeShipmentStatusAction(change);
    expect(result).toEqual({ success: false, error: 'errors.db.staffChangedSinceOpened' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('delegates cancellation to the guarded, idempotent staff cancellation action', async () => {
    rpc.mockResolvedValue({
      data: { status: 'cancelled', refundRequired: true, cashCollected: '20' },
      error: null,
    });
    const result = await operatorChangeShipmentStatusAction({
      ...change,
      status: 'cancel',
      expectedStatus: 'assigned',
      reason: 'Customer requested cancellation',
    });
    expect(result).toEqual({
      success: true,
      data: { status: 'cancel', canonicalStatus: 'cancelled', refundRequired: true },
    });
    expect(rpc).toHaveBeenCalledWith('staff_cancel_shipment', {
      p_shipment_id: SHIPMENT,
      p_expected_status: 'assigned',
      p_reason: 'Customer requested cancellation',
      p_request_id: REQUEST,
    });
  });

  it('requires a cancellation reason', async () => {
    expect(await operatorChangeShipmentStatusAction({ ...change, status: 'cancel', reason: '' })).toEqual({
      success: false,
      error: 'operator.validation.cancelReason',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never bypasses the driver proof-of-delivery workflow', async () => {
    expect(await operatorChangeShipmentStatusAction({ ...change, status: 'delivered' })).toEqual({
      success: false,
      error: 'errors.db.completeWithProof',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('marks a failed delivery returned with its required reason', async () => {
    shipment.status = 'delivery_failed';
    const result = await operatorChangeShipmentStatusAction({
      ...change,
      expectedStatus: 'delivery_failed',
      status: 'returned',
      reason: 'Recipient refused the parcel',
    });
    expect(result).toEqual({
      success: true,
      data: { status: 'returned', canonicalStatus: 'returned' },
    });
    expect(shipmentUpdate).toHaveBeenCalledWith({
      status: 'returned',
      delivery_failed_reason: 'Recipient refused the parcel',
    });
  });

  it('rejects returning a shipment outside the existing failed-delivery workflow', async () => {
    const result = await operatorChangeShipmentStatusAction({
      ...change,
      expectedStatus: 'in_transit',
      status: 'returned',
      reason: 'Recipient refused the parcel',
    });
    expect(result).toEqual({ success: false, error: 'operator.errors.cannotMarkReturned' });
    expect(shipmentUpdate).not.toHaveBeenCalled();
  });

  it('rejects unauthorized users before accessing shipment data', async () => {
    role.current = 'manager';
    await expect(operatorChangeShipmentStatusAction(change)).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });
});
