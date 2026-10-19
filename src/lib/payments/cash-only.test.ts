import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MultiBookingInput } from '@/lib/shipment/schemas';

// Card payments off (migration 0048). The flag is server-side and off unless
// an administrator turns it on AND a real provider replaces the stub; every
// booking action refuses a card booking while it's off, whatever the browser
// sent (the database refuses it again — database/test/cash-remittances.sql).

const CUSTOMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const role = vi.hoisted(() => ({ current: 'customer' as string }));
const createBooking = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/security/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/lib/security/rate-limit', () => ({
  RATE_LIMIT_MESSAGE: 'errors.rateLimited',
  checkRateLimit: async () => true,
  checkIpRateLimit: async () => true,
}));
vi.mock('@/services/tracking/get-shipment-tracking', () => ({ getShipmentTracking: vi.fn() }));
vi.mock('@/services/shipments/create-booking', () => ({ createBooking, createGuestBooking: vi.fn() }));
vi.mock('@/services/notifications/operator-booking-emails', () => ({ scheduleOperatorBookingEmails: vi.fn() }));
// The on-behalf booking first looks the customer up: an active customer.
const customerLookup = {
  select: () => customerLookup,
  eq: () => customerLookup,
  maybeSingle: async () => ({ data: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', role: 'customer', active: true } }),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, from: () => customerLookup }) }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: CUSTOMER_ID, role: role.current };
  },
}));

const { assertPaymentMethodAllowed, availablePaymentMethods, cardPaymentsEnabled } = await import('@/lib/payments');
const { createBookingAction, createBookingForCustomerAction, switchToCashAction } = await import('@/lib/shipment/actions');

const location = (address: string, lat: number, lng: number) => ({ address, lat, lng, contactName: 'Aisha', contactPhone: '+971 50 123 4567' });

const booking = (paymentMethod: 'card' | 'cod'): MultiBookingInput =>
  ({
    shipments: [
      {
        pickup: location('Al Barsha, Dubai', 25.09, 55.14),
        dropoff: location('Business Bay, Dubai', 25.18, 55.27),
        deliveryType: 'same_day',
        packageType: 'parcel',
        packageDescription: 'Shoes',
        packageQuantity: 1,
        packageWeightKg: 1,
        isFragile: false,
        recipientPaymentType: 'postpaid',
        codAmount: 150,
        clientRequestId: '99999999-0000-4000-8000-000000000001',
      },
    ],
    paymentMethod,
    clientRequestId: '99999999-0000-4000-8000-000000000002',
  }) as MultiBookingInput;

beforeEach(() => {
  role.current = 'customer';
  createBooking.mockReset().mockResolvedValue({ shipments: [{ id: 's1', price: 21.6 }], batchId: null, reference: null, total: 21.6, failed: [] });
  rpc.mockReset().mockResolvedValue({ data: 'confirmed', error: null });
  vi.unstubAllEnvs();
});

describe('the card payments flag', () => {
  it('is off when absent', () => {
    expect(cardPaymentsEnabled({})).toBe(false);
  });

  it('stays off with CARD_PAYMENTS_ENABLED=true while no real provider replaces the stub', () => {
    expect(cardPaymentsEnabled({ CARD_PAYMENTS_ENABLED: 'true' })).toBe(false);
  });

  it('offers cash only while off, and both once on', () => {
    expect(availablePaymentMethods(false)).toEqual(['cod']);
    expect(availablePaymentMethods(true)).toEqual(['card', 'cod']);
  });

  it('refuses card and never cash', () => {
    expect(assertPaymentMethodAllowed('card', false)).toBe('booking.errors.cardUnavailable');
    expect(assertPaymentMethodAllowed('cod', false)).toBeNull();
    expect(assertPaymentMethodAllowed('card', true)).toBeNull();
  });
});

describe('booking actions while card payments are off', () => {
  it('refuse a card booking sent straight to the action, before anything is created', async () => {
    vi.stubEnv('CARD_PAYMENTS_ENABLED', 'true');
    expect(await createBookingAction(booking('card'))).toEqual({ success: false, error: 'booking.errors.cardUnavailable' });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('refuse it for staff booking on a customer’s behalf too', async () => {
    role.current = 'operator';
    expect(await createBookingForCustomerAction(OTHER_ID, booking('card'))).toEqual({
      success: false,
      error: 'booking.errors.cardUnavailable',
    });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('book cash as before, the COD amount untouched', async () => {
    const result = await createBookingAction(booking('cod'));
    expect(result.success).toBe(true);
    expect(createBooking).toHaveBeenCalledTimes(1);
    const input = createBooking.mock.calls[0][0].input as MultiBookingInput;
    expect(input.paymentMethod).toBe('cod');
    expect(input.shipments[0].codAmount).toBe(150);
  });
});

describe('switchToCashAction', () => {
  it('asks the database to switch, sending only the shipment id', async () => {
    expect(await switchToCashAction('11111111-1111-4111-8111-111111111111')).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('switch_shipment_to_cash', { p_shipment_id: '11111111-1111-4111-8111-111111111111' });
  });

  it('refuses a driver', async () => {
    role.current = 'driver';
    await expect(switchToCashAction('11111111-1111-4111-8111-111111111111')).rejects.toThrow('Forbidden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never reports success when the database refuses (e.g. already paid by card)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: "This shipment already has a card payment, so it can't switch to cash" } });
    expect(await switchToCashAction('11111111-1111-4111-8111-111111111111')).toEqual({
      success: false,
      error: 'errors.db.switchAlreadyPaid',
    });
  });
});
