import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cashHref, parseCashFilters, parseDriverLedgerFilters, remittanceSchema } from '@/lib/cash/schemas';
import { safeErrorMessage } from '@/lib/security/errors';

// Driver remittances (migration 0042). The balances and limits are the
// database's (record_driver_remittance / decide_driver_remittance, covered
// by database/test/driver-cash.sql); these tests cover the app's side of
// the boundary: who may call, what is validated before the call, that only
// the form's own fields are sent (never a total or balance), and that the
// database's refusals reach the user as readable messages.

const DRIVER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REMITTANCE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const role = vi.hoisted(() => ({ current: 'operator' as string }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: 'staff', role: role.current };
  },
}));

const { decideRemittanceAction, recordRemittanceAction } = await import('@/lib/cash/actions');

const remittance = {
  driverId: DRIVER,
  amount: 600,
  method: 'cash' as const,
  receivedOn: '2026-10-10',
  reference: 'R-1',
  clientRequestId: '11111111-0000-4000-8000-000000000001',
};

beforeEach(() => {
  role.current = 'operator';
  rpc.mockReset().mockResolvedValue({ data: REMITTANCE, error: null });
});

describe('recordRemittanceAction', () => {
  it('sends only the form’s fields to the database', async () => {
    expect(await recordRemittanceAction(remittance)).toEqual({ success: true, id: REMITTANCE });
    expect(rpc).toHaveBeenCalledWith('record_driver_remittance', {
      p_driver_id: DRIVER,
      p_amount: 600,
      p_method: 'cash',
      p_received_on: '2026-10-10',
      p_reference: 'R-1',
      p_notes: null,
      p_client_request_id: remittance.clientRequestId,
    });
  });

  it('ignores a balance or status smuggled into the request', async () => {
    await recordRemittanceAction({ ...remittance, outstanding: 0, status: 'confirmed' } as typeof remittance);
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual([
      'p_amount',
      'p_client_request_id',
      'p_driver_id',
      'p_method',
      'p_notes',
      'p_received_on',
      'p_reference',
    ]);
  });

  it('is open to managers', async () => {
    role.current = 'manager';
    expect(await recordRemittanceAction(remittance)).toMatchObject({ success: true });
  });

  it.each(['driver', 'customer'])('refuses a %s', async (who) => {
    role.current = who;
    await expect(recordRemittanceAction(remittance)).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', { amount: 0 }, 'operator.cash.validation.amount'],
    ['a negative amount', { amount: -50 }, 'operator.cash.validation.amount'],
    ['three decimals', { amount: 10.005 }, 'operator.cash.validation.twoDecimals'],
    ['an absurd amount', { amount: 5_000_000 }, 'operator.cash.validation.amountTooLarge'],
    ['an unknown method', { method: 'crypto' }, 'operator.cash.validation.method'],
    ['a bad date', { receivedOn: '10/10/2026' }, 'operator.cash.validation.date'],
    ['a bad driver id', { driverId: 'not-a-driver' }, 'operator.cash.validation.driver'],
  ])('rejects %s before calling the database', async (_label, change, error) => {
    expect(await recordRemittanceAction({ ...remittance, ...change } as typeof remittance)).toEqual({
      success: false,
      error,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('shows the database’s refusal of an amount above what is owed', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'This is more than the driver owes: AED 400.00 outstanding, AED 0.00 already awaiting confirmation',
      },
    });
    const result = await recordRemittanceAction(remittance);
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain('errors.db.remittanceTooLarge');
    expect(!result.success && result.error).toContain('400.00');
  });

  it('never leaks a raw database error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for table driver_cash_remittances' } });
    expect(await recordRemittanceAction(remittance)).toEqual({ success: false, error: 'errors.forbidden' });
  });
});

describe('decideRemittanceAction', () => {
  it('lets a manager confirm', async () => {
    role.current = 'manager';
    rpc.mockResolvedValue({ data: 'confirmed', error: null });
    expect(await decideRemittanceAction({ remittanceId: REMITTANCE, decision: 'confirmed' })).toEqual({
      success: true,
      id: REMITTANCE,
    });
    expect(rpc).toHaveBeenCalledWith('decide_driver_remittance', {
      p_remittance_id: REMITTANCE,
      p_decision: 'confirmed',
      p_note: null,
    });
  });

  it('needs a reason to reject', async () => {
    role.current = 'manager';
    expect(await decideRemittanceAction({ remittanceId: REMITTANCE, decision: 'rejected', note: '  ' })).toEqual({
      success: false,
      error: 'operator.cash.validation.rejectReason',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['operator', 'driver', 'customer'])('refuses a %s', async (who) => {
    role.current = who;
    await expect(decideRemittanceAction({ remittanceId: REMITTANCE, decision: 'confirmed' })).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('cash filters', () => {
  it('keeps valid dates and swaps a reversed range', () => {
    expect(parseCashFilters({ q: ' Aziz ', from: '2026-10-31', to: '2026-10-01' })).toEqual({
      q: 'Aziz',
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it('drops dates that aren’t dates', () => {
    expect(parseCashFilters({ from: '2026-13-45', to: 'yesterday' })).toEqual({ q: '', from: null, to: null });
  });

  it('only accepts known statuses for the ledger', () => {
    expect(parseDriverLedgerFilters({ collection: 'collected', remittance: 'bogus' })).toMatchObject({
      collection: 'collected',
      remittance: 'all',
    });
    expect(parseDriverLedgerFilters({ collection: 'unverified' }).collection).toBe('unverified');
  });

  it('builds tidy URLs', () => {
    expect(cashHref('/dashboard/operator/cash', { q: '', from: '2026-10-01', to: null, collection: 'all' })).toBe(
      '/dashboard/operator/cash?from=2026-10-01',
    );
    expect(cashHref('/x', {})).toBe('/x');
  });

  it('accepts a remittance with two decimals', () => {
    expect(remittanceSchema.safeParse({ ...remittance, amount: 199.99 }).success).toBe(true);
  });
});

describe('database messages', () => {
  it.each([
    ['Only a manager can confirm or reject a remittance', 'errors.db.remittanceManagerDecides'],
    ['Record a driver remittance to settle this cash', 'errors.db.settleWithRemittance'],
    ["A recorded collection can't be changed", 'errors.db.collectionLocked'],
    ['Give a reason for the correction', 'errors.db.correctionReason'],
    ["Delivered shipments have proof of delivery and can't be corrected here", 'errors.db.correctionDelivered'],
    [
      'This customer has no ParcelLink account to receive a code. Use the delivery photo as proof.',
      'errors.db.guestNoOtp',
    ],
  ])('translates "%s"', (message, key) => {
    expect(safeErrorMessage({ code: 'P0001', message })).toBe(key);
  });

  it('translates a stale correction with the status it is now', () => {
    const message = safeErrorMessage({
      code: 'P0001',
      message: 'This shipment is now picked_up, not in_transit — reload it before correcting',
    });
    expect(message).toContain('errors.db.correctionStale');
    expect(message).toContain('shipments.status.picked_up');
  });

  it('translates a correction that isn’t allowed', () => {
    const message = safeErrorMessage({ code: 'P0001', message: "A shipment can't be corrected from in_transit to confirmed" });
    expect(message).toContain('errors.db.correctionNotAllowed');
  });
});
