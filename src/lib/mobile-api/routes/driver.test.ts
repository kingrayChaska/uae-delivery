import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actions = vi.hoisted(() => ({
  acceptShipmentAction: vi.fn(),
  advanceShipmentStatusAction: vi.fn(),
  cancelShipmentAsDriverAction: vi.fn(),
  declineShipmentAction: vi.fn(),
  markCodCollectedAction: vi.fn(),
  recordDriverLocationAction: vi.fn(),
  reportDeliveryFailedAction: vi.fn(),
  requestDeliveryOtpAction: vi.fn(),
  returnShipmentAction: vi.fn(),
  submitProofOfDeliveryAction: vi.fn(),
  updateAvailabilityAction: vi.fn(),
}));
const getShipmentDetail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/driver/actions', () => actions);
vi.mock('@/lib/driver/verify-qr-action', () => ({ verifyShipmentQrAction: vi.fn() }));
vi.mock('@/services/shipments/get-shipment', () => ({ getShipmentDetail }));
vi.mock('@/services/drivers/get-driver-profile', () => ({ getDriverProfileDetail: vi.fn() }));
vi.mock('@/services/shipments/list-driver-cod', () => ({ listDriverCodTransactions: vi.fn() }));
vi.mock('@/services/shipments/list-driver-shipments', () => ({
  getDriverDashboardSummary: vi.fn(),
  listDriverActiveShipments: vi.fn(),
  listDriverHistory: vi.fn(),
  searchDriverShipments: vi.fn(),
}));

import { toDriverShipment } from '@/lib/mobile-api/projections';
import { driverRoutes } from '@/lib/mobile-api/routes/driver';

import type { RouteContext } from '@/lib/mobile-api/router';
import type { Profile, Shipment } from '@/lib/types';

const ID = '22222222-2222-4222-8222-222222222222';
const driver = { id: '11111111-1111-4111-8111-111111111111', role: 'driver' } as Profile;

const shipment = (overrides: Partial<Shipment> = {}): Shipment =>
  ({
    id: ID,
    trackingNumber: 'PL-1',
    customerId: 'customer-secret-id',
    guestCustomer: null,
    bookedBy: 'staff-id',
    driverId: driver.id,
    status: 'arrived_destination',
    pickup: { formattedAddress: 'A', coordinates: { lat: 25, lng: 55 }, contactName: 'S', contactPhone: '1' },
    dropoff: { formattedAddress: 'B', coordinates: { lat: 25.1, lng: 55.1 }, contactName: 'R', contactPhone: '2' },
    distanceKm: 10,
    durationMinutes: 20,
    price: 30,
    currency: 'AED',
    paymentMethod: 'card',
    paymentStatus: 'paid',
    recipientPaymentType: 'prepaid',
    codAmount: 0,
    productValue: 999,
    baseCharge: 10,
    distanceCharge: 20,
    priceAdjustment: 0,
    packageDescription: 'Box',
    packageQuantity: 1,
    isFragile: false,
    ...overrides,
  }) as Shipment;

const route = (method: string, path: string) => {
  const found = driverRoutes.find((r) => r.method === method && r.path === path);
  if (!found) throw new Error(`no route ${method} ${path}`);
  return found;
};
const ctx = (params: Record<string, string>, body: unknown = {}): RouteContext => ({
  params,
  query: new URLSearchParams(),
  body,
  profile: driver,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('driver routes', () => {
  it('only allows the driver role on every route', () => {
    for (const r of driverRoutes) expect(r.access).toEqual(['driver']);
  });

  it('takes "is there COD to confirm" from the shipment, not the app', async () => {
    getShipmentDetail.mockResolvedValue({ shipment: shipment({ recipientPaymentType: 'postpaid', codAmount: 150 }), history: [] });
    actions.submitProofOfDeliveryAction.mockResolvedValue({ success: true });

    await route('POST', 'driver/shipments/:id/complete').handle(
      ctx({ id: ID }, { photoPath: `${ID}/photo-x.jpg`, notes: 'Handed over', codCollected: true, collectsCod: false }),
    );

    expect(actions.submitProofOfDeliveryAction).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId: ID, collectsCod: true, codCollected: true, signaturePath: null }),
    );
  });

  it('refuses proof of delivery for a shipment the driver cannot see', async () => {
    getShipmentDetail.mockResolvedValue(null);
    const result = await route('POST', 'driver/shipments/:id/complete').handle(ctx({ id: ID }, {}));
    expect(result).toEqual({ status: 404, error: 'driver.errors.shipmentNotFound' });
    expect(actions.submitProofOfDeliveryAction).not.toHaveBeenCalled();
  });

  it('passes action refusals through as 422 with the message key', async () => {
    getShipmentDetail.mockResolvedValue({ shipment: shipment(), history: [] });
    actions.submitProofOfDeliveryAction.mockResolvedValue({ success: false, error: 'driver.errors.incorrectCode' });
    const result = await route('POST', 'driver/shipments/:id/complete').handle(ctx({ id: ID }, { notes: 'x' }));
    expect(result).toEqual({ status: 422, error: 'driver.errors.incorrectCode' });
  });

  it.each(['delivered', 'cancelled', 'returned', 'delivery_failed', 'assigned', '', 42])(
    'never lets "advance" set %j',
    async (status) => {
      const result = await route('POST', 'driver/shipments/:id/advance').handle(ctx({ id: ID }, { status }));
      expect(result).toEqual({ status: 422, error: 'driver.errors.statusUpdate' });
      expect(actions.advanceShipmentStatusAction).not.toHaveBeenCalled();
    },
  );

  it('advances through the forward steps via the website action', async () => {
    actions.advanceShipmentStatusAction.mockResolvedValue({ success: true });
    await route('POST', 'driver/shipments/:id/advance').handle(ctx({ id: ID }, { status: 'picked_up' }));
    expect(actions.advanceShipmentStatusAction).toHaveBeenCalledWith(ID, 'picked_up');
  });

  it('hides a shipment the driver cannot see behind the same not-found as a missing one', async () => {
    getShipmentDetail.mockResolvedValue(null);
    expect(await route('GET', 'driver/shipments/:id').handle(ctx({ id: ID }))).toEqual({
      status: 404,
      error: 'driver.errors.shipmentNotFound',
    });
    expect(await route('GET', 'driver/shipments/:id').handle(ctx({ id: 'not-a-uuid' }))).toEqual({
      status: 404,
      error: 'driver.errors.shipmentNotFound',
    });
  });
});

describe('toDriverShipment', () => {
  it('leaves out pricing internals, customer ids and product value', () => {
    const projected = toDriverShipment(shipment()) as Record<string, unknown>;
    for (const field of ['customerId', 'bookedBy', 'productValue', 'price', 'baseCharge', 'distanceCharge', 'priceAdjustment', 'paymentStatus']) {
      expect(projected).not.toHaveProperty(field);
    }
  });

  it("computes the cash to collect with the website's rules", () => {
    expect(toDriverShipment(shipment({ recipientPaymentType: 'postpaid', codAmount: 150, paymentMethod: 'cod', price: 30 })).collection).toEqual({
      fromRecipient: 150,
      senderCashFee: 30,
      currency: 'AED',
    });
    expect(toDriverShipment(shipment()).collection).toEqual({ fromRecipient: 0, senderCashFee: 0, currency: 'AED' });
  });
});
