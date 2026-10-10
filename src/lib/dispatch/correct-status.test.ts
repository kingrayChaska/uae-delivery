import { beforeEach, describe, expect, it, vi } from 'vitest';

// correctShipmentStatusAction (migration 0041). The rules themselves live in
// correct_shipment_status() and are covered by database/test/status-corrections.sql;
// here: who may call it, what is checked first, that the status the operator
// saw goes with the request (so a stale view is refused), and that no actor
// id is ever sent — the database takes it from the session.

const SHIPMENT = '11111111-1111-4111-8111-111111111111';

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

const { correctShipmentStatusAction } = await import('@/lib/dispatch/actions');

const correction = {
  shipmentId: SHIPMENT,
  expectedStatus: 'in_transit' as const,
  newStatus: 'assigned' as const,
  reason: 'Driver marked In Transit before pickup',
};

beforeEach(() => {
  role.current = 'operator';
  rpc.mockReset().mockResolvedValue({ data: 'assigned', error: null });
});

describe('correctShipmentStatusAction', () => {
  it('sends the status the operator saw, the new one and the reason — and no actor', async () => {
    expect(await correctShipmentStatusAction(correction)).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('correct_shipment_status', {
      p_shipment_id: SHIPMENT,
      p_expected_status: 'in_transit',
      p_new_status: 'assigned',
      p_reason: 'Driver marked In Transit before pickup',
    });
  });

  it('is open to managers', async () => {
    role.current = 'manager';
    expect(await correctShipmentStatusAction(correction)).toEqual({ success: true });
  });

  it.each(['driver', 'customer'])('refuses a %s', async (who) => {
    role.current = who;
    await expect(correctShipmentStatusAction(correction)).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    expect(await correctShipmentStatusAction({ ...correction, reason: '' })).toEqual({
      success: false,
      error: 'operator.validation.correctionReason',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a status that does not exist', async () => {
    const result = await correctShipmentStatusAction({ ...correction, newStatus: 'lost' as never });
    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a stale view in words, with the current status', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'This shipment is now delivered, not in_transit — reload it before correcting' },
    });
    const result = await correctShipmentStatusAction(correction);
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain('errors.db.correctionStale');
    expect(!result.success && result.error).toContain('shipments.status.delivered');
  });
});
