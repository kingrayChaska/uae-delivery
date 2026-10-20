import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const m = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  getShipmentDetail: vi.fn(),
  getStaffActionContext: vi.fn(),
  adjustShipmentPriceAction: vi.fn(),
  staffCancelShipmentAction: vi.fn(),
  reassignDriverAction: vi.fn(),
  getAvailableDriversAction: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: m.getCurrentProfile }));
vi.mock('@/lib/cash/actions', () => ({ decideRemittanceAction: vi.fn(), recordRemittanceAction: vi.fn() }));
vi.mock('@/lib/cod/actions', () => ({ reconcileCodAction: vi.fn(), remitCodAction: vi.fn() }));
vi.mock('@/lib/dispatch/actions', () => ({
  adjustShipmentPriceAction: m.adjustShipmentPriceAction,
  assignDriverAction: vi.fn(),
  correctShipmentStatusAction: vi.fn(),
  getAvailableDriversAction: m.getAvailableDriversAction,
  markReturnedAction: vi.fn(),
  reassignDriverAction: m.reassignDriverAction,
  staffCancelShipmentAction: m.staffCancelShipmentAction,
}));
vi.mock('@/services/bulk/list-batches', () => ({
  getBatchDetail: vi.fn(),
  getBatchLabel: vi.fn(async () => null),
  getBatchDispatchBacklog: vi.fn(),
  listBatches: vi.fn(),
}));
vi.mock('@/services/cash/driver-cash', () => ({
  countPendingRemittances: vi.fn(),
  getDriverCashPosition: vi.fn(),
  getDriverCashTotals: vi.fn(),
  getDriverIdentity: vi.fn(),
  listDriverCash: vi.fn(),
  listDriverCollections: vi.fn(),
  listDriverRemittances: vi.fn(),
}));
vi.mock('@/services/cod/list-all-cod', () => ({ getCodTotals: vi.fn(), listCodTransactionsPage: vi.fn() }));
vi.mock('@/services/customers/list-customers', () => ({ listCustomers: vi.fn() }));
vi.mock('@/services/drivers/list-all-drivers', () => ({ listAllDrivers: vi.fn() }));
vi.mock('@/services/drivers/get-driver-locations-snapshot', () => ({ getDriverLocationsSnapshot: vi.fn() }));
vi.mock('@/services/drivers/list-drivers-for-live-map', () => ({ listDriversForLiveMap: vi.fn() }));
vi.mock('@/services/invoices/get-invoice', () => ({ getInvoiceNumberFor: vi.fn(async () => null) }));
vi.mock('@/services/profiles/get-profile-name', () => ({
  getProfileName: vi.fn(async (id: string | null) => (id ? `name-of-${id}` : null)),
  getProfileAccountType: vi.fn(async () => 'individual'),
}));
vi.mock('@/services/shipments/get-operations-summary', () => ({ getOperationsSummary: vi.fn() }));
vi.mock('@/services/shipments/get-outcome-proof', () => ({ getOutcomeProof: vi.fn(async () => null) }));
vi.mock('@/services/shipments/get-proof-of-delivery', () => ({ getProofOfDelivery: vi.fn(async () => null) }));
vi.mock('@/services/shipments/get-shipment', () => ({ getShipmentDetail: m.getShipmentDetail }));
vi.mock('@/services/shipments/get-staff-actions', () => ({
  getStaffActionContext: m.getStaffActionContext,
  listStaffShipmentEvents: vi.fn(async () => []),
}));
vi.mock('@/services/shipments/list-all-shipments', () => ({ listUnassignedShipments: vi.fn(), searchStaffShipments: vi.fn() }));

import { staffRoutes } from '@/lib/mobile-api/routes/staff';

import type { RouteContext } from '@/lib/mobile-api/router';
import type { Profile, Shipment } from '@/lib/types';

const ID = '33333333-3333-4333-8333-333333333333';
const DRIVER = '44444444-4444-4444-8444-444444444444';
const route = (method: string, path: string) => {
  const found = staffRoutes.find((r) => r.method === method && r.path === path);
  if (!found) throw new Error(`no route ${method} ${path}`);
  return found;
};
const ctx = (params: Record<string, string>, body: unknown = {}, role: Profile['role'] = 'operator'): RouteContext => ({
  params,
  query: new URLSearchParams(),
  body,
  profile: { id: 'staff', role } as Profile,
});
const shipment = (overrides: Partial<Shipment>) =>
  ({ id: ID, status: 'cancelled', driverId: DRIVER, customerId: 'c1', bookedBy: 'c1', batchId: null, paymentStatus: 'paid', ...overrides }) as Shipment;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('staff routes', () => {
  it('lets only operators and managers in, and only managers decide remittances', () => {
    for (const r of staffRoutes) {
      if (r.path === 'staff/remittances/:id/decide') expect(r.access).toEqual(['manager']);
      else expect(r.access).toEqual(['operator', 'manager']);
    }
  });

  it.each([
    ['operator', []],
    ['manager', ['assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination']],
  ] as const)('offers corrections of a cancelled shipment to a %s per the website rule', async (role, expected) => {
    m.getCurrentProfile.mockResolvedValue({ role });
    m.getShipmentDetail.mockResolvedValue({ shipment: shipment({}), history: [], packageImageUrl: null });
    m.getStaffActionContext.mockResolvedValue({ priceEditBlock: 'closed', cancelBlock: 'cancelled' });
    const result = await route('GET', 'staff/shipments/:id').handle(ctx({ id: ID }, {}, role));
    expect(result.status).toBe(200);
    const data = (result as { data: { allowed: Record<string, unknown>; refundOutstanding: boolean } }).data;
    expect(data.allowed.correctTo).toEqual(expected);
    expect(data.allowed).toMatchObject({ assign: false, reassign: false, priceEdit: false, cancel: false });
    expect(data.refundOutstanding).toBe(true);
  });

  it('offers assign only for a confirmed, unassigned shipment', async () => {
    m.getCurrentProfile.mockResolvedValue({ role: 'operator' });
    m.getShipmentDetail.mockResolvedValue({ shipment: shipment({ status: 'confirmed', driverId: null }), history: [] });
    m.getStaffActionContext.mockResolvedValue({ priceEditBlock: null, cancelBlock: null });
    const { data } = (await route('GET', 'staff/shipments/:id').handle(ctx({ id: ID }))) as { data: { allowed: Record<string, unknown> } };
    expect(data.allowed).toMatchObject({ assign: true, reassign: false, priceEdit: true, cancel: true });
  });

  it('passes the expected state and request id through to the price change', async () => {
    m.adjustShipmentPriceAction.mockResolvedValue({ success: true, data: { price: 40, voidedInvoices: [] } });
    const requestId = '55555555-5555-4555-8555-555555555555';
    await route('POST', 'staff/shipments/:id/price').handle(
      ctx({ id: ID }, { expectedStatus: 'assigned', expectedPrice: 35, serviceCharge: '30', reason: 'Agreed rate', requestId, price: 1 }),
    );
    expect(m.adjustShipmentPriceAction).toHaveBeenCalledWith({
      shipmentId: ID,
      expectedStatus: 'assigned',
      expectedPrice: 35,
      serviceCharge: '30',
      reason: 'Agreed rate',
      requestId,
    });
  });

  it('reassigns against the driver the operator saw (compare-and-set), including "none"', async () => {
    m.reassignDriverAction.mockResolvedValue({ success: false, error: 'operator.errors.assignmentChanged' });
    const result = await route('POST', 'staff/shipments/:id/reassign').handle(ctx({ id: ID }, { driverId: DRIVER, expectedDriverId: null }));
    expect(m.reassignDriverAction).toHaveBeenCalledWith(ID, DRIVER, null);
    expect(result).toEqual({ status: 422, error: 'operator.errors.assignmentChanged' });
  });

  it("finds drivers near the shipment's own pickup, not one the app sends", async () => {
    m.getShipmentDetail.mockResolvedValue({ shipment: shipment({ pickup: { coordinates: { lat: 25.2, lng: 55.3 } } as Shipment['pickup'] }) });
    m.getAvailableDriversAction.mockResolvedValue([]);
    await route('GET', 'staff/shipments/:id/drivers').handle(ctx({ id: ID }, { lat: 0, lng: 0 }));
    expect(m.getAvailableDriversAction).toHaveBeenCalledWith({ lat: 25.2, lng: 55.3 });
  });
});
