import { beforeEach, describe, expect, it, vi } from 'vitest';

// Issuing invoices (migrations 0031, 0054). Who may bill which shipment and
// every amount are the database's (database/test/guest-invoices.sql); here:
// the role check, the id check, and that only the id is sent.

const SHIPMENT = '22222222-2222-4222-8222-222222222222';
const BATCH = '33333333-3333-4333-8333-333333333333';

const role = vi.hoisted(() => ({ current: 'operator' as string }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));
vi.mock('@/lib/security/rate-limit', () => ({ RATE_LIMIT_MESSAGE: 'errors.rateLimited', checkRateLimit: async () => true }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: role.current };
  },
}));

const { issueBatchInvoiceAction, issueShipmentInvoiceAction } = await import('@/lib/invoices/actions');

beforeEach(() => {
  role.current = 'operator';
  rpc.mockReset().mockResolvedValue({ data: 'INV-2026-000042', error: null });
});

describe('issueShipmentInvoiceAction', () => {
  it.each(['operator', 'manager', 'customer'])('lets a %s ask; only the shipment id is sent', async (who) => {
    role.current = who;
    expect(await issueShipmentInvoiceAction(SHIPMENT)).toEqual({ success: true, invoiceNumber: 'INV-2026-000042' });
    expect(rpc).toHaveBeenCalledWith('issue_shipment_invoice', { p_shipment_id: SHIPMENT });
  });

  it('a retry gets the same invoice back (the database returns the one issued)', async () => {
    const first = await issueShipmentInvoiceAction(SHIPMENT);
    const second = await issueShipmentInvoiceAction(SHIPMENT);
    expect(second).toEqual(first);
  });

  it('refuses a driver before touching the database', async () => {
    role.current = 'driver';
    expect(await issueShipmentInvoiceAction(SHIPMENT)).toEqual({ success: false, error: 'invoices.errors.generateFailed' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on the database’s refusal of a shipment the caller may not bill', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Shipment not found' } });
    expect(await issueShipmentInvoiceAction(SHIPMENT)).toEqual({ success: false, error: 'errors.db.shipmentNotFound' });
  });

  it('refuses a malformed id', async () => {
    expect(await issueShipmentInvoiceAction('1; drop table invoices')).toEqual({ success: false, error: 'errors.db.shipmentNotFound' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('issueBatchInvoiceAction', () => {
  it('stays the merchant’s: staff can’t issue bulk invoices', async () => {
    expect(await issueBatchInvoiceAction(BATCH)).toEqual({ success: false, error: 'invoices.errors.generateFailed' });
    expect(rpc).not.toHaveBeenCalled();
    role.current = 'customer';
    expect(await issueBatchInvoiceAction(BATCH)).toMatchObject({ success: true });
  });
});
