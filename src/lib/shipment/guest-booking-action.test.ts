import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MultiBookingInput } from '@/lib/shipment/schemas';

// createGuestBookingAction: staff booking for a customer with no ParcelLink
// account (migration 0040). The booking service is faked; what's checked
// is the action's own boundary — who may call it, what it validates, and
// that the booker comes from the session, never the request.

const STAFF_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const role = vi.hoisted(() => ({ current: 'operator' as string }));
const audit = vi.hoisted(() => vi.fn());
const createGuestBooking = vi.hoisted(() => vi.fn());
const createBooking = vi.hoisted(() => vi.fn());
const rateLimited = vi.hoisted(() => ({ value: false }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: audit }));
vi.mock('@/lib/security/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/lib/security/rate-limit', () => ({
  RATE_LIMIT_MESSAGE: 'errors.rateLimited',
  checkRateLimit: async () => !rateLimited.value,
  checkIpRateLimit: async () => true,
}));
vi.mock('@/services/tracking/get-shipment-tracking', () => ({ getShipmentTracking: vi.fn() }));
vi.mock('@/services/shipments/create-booking', () => ({ createBooking, createGuestBooking }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: STAFF_ID, role: role.current };
  },
}));

const { createGuestBookingAction } = await import('@/lib/shipment/actions');

const location = (address: string, lat: number, lng: number, contactName: string, contactPhone: string) => ({
  address,
  lat,
  lng,
  contactName,
  contactPhone,
});

const booking = (overrides: Partial<MultiBookingInput> = {}): MultiBookingInput => ({
  shipments: [
    {
      pickup: location('Al Barsha, Dubai', 25.09, 55.14, 'Wanda', '+971 55 909 1234'),
      dropoff: location('Business Bay, Dubai', 25.18, 55.27, 'Rami', '050 777 0000'),
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
  paymentMethod: 'cod',
  clientRequestId: '99999999-0000-4000-8000-000000000002',
  ...overrides,
});

const guest = { name: 'Wanda WhatsApp', phone: '+971 55 909 1234' };

beforeEach(() => {
  role.current = 'operator';
  rateLimited.value = false;
  audit.mockReset();
  createBooking.mockReset();
  createGuestBooking.mockReset().mockResolvedValue({
    shipments: [{ id: 'ship-1' }],
    batchId: null,
    reference: null,
    total: 21.6,
    failed: [],
  });
});

describe('createGuestBookingAction', () => {
  it('lets an operator book for a customer without an account', async () => {
    const result = await createGuestBookingAction(guest, booking());
    expect(result).toMatchObject({ success: true, shipmentIds: ['ship-1'], batchId: null });
    expect(createGuestBooking).toHaveBeenCalledOnce();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('lets a manager book too', async () => {
    role.current = 'manager';
    expect(await createGuestBookingAction(guest, booking())).toMatchObject({ success: true });
  });

  it.each(['customer', 'driver'])('refuses a %s', async (who) => {
    role.current = who;
    await expect(createGuestBookingAction(guest, booking())).rejects.toThrow('Forbidden');
    expect(createGuestBooking).not.toHaveBeenCalled();
  });

  it('records the signed-in staff member as the booker, whatever the request says', async () => {
    const tampered = { ...guest, bookedBy: OTHER_ID } as typeof guest;
    await createGuestBookingAction(tampered, booking());
    expect(createGuestBooking.mock.calls[0][0]).toMatchObject({ bookedBy: STAFF_ID, guest });
    expect(createGuestBooking.mock.calls[0][0].guest).not.toHaveProperty('bookedBy');
  });

  it.each([
    ['a missing name', { name: ' ', phone: guest.phone }, 'booking.validation.guestName'],
    ['a one-letter name', { name: 'W', phone: guest.phone }, 'booking.validation.guestName'],
    ['a missing phone', { name: guest.name, phone: '' }, 'booking.validation.phone'],
    ['a phone with letters', { name: guest.name, phone: 'call me' }, 'booking.validation.phone'],
  ])('rejects %s', async (_label, details, error) => {
    expect(await createGuestBookingAction(details, booking())).toEqual({ success: false, error });
    expect(createGuestBooking).not.toHaveBeenCalled();
  });

  it('only takes a cash delivery fee (no account to pay a card from)', async () => {
    expect(await createGuestBookingAction(guest, booking({ paymentMethod: 'card' }))).toEqual({
      success: false,
      error: 'booking.errors.guestCashOnly',
    });
    expect(createGuestBooking).not.toHaveBeenCalled();
  });

  it('validates the shipment itself like any booking', async () => {
    const input = booking();
    input.shipments[0].dropoff.address = '';
    expect(await createGuestBookingAction(guest, input)).toEqual({
      success: false,
      error: 'booking.validation.chooseLocation',
    });
    expect(createGuestBooking).not.toHaveBeenCalled();
  });

  it('passes on a pricing or coverage refusal from the booking service', async () => {
    createGuestBooking.mockRejectedValueOnce(new Error('booking.errors.outsideServiceArea'));
    expect(await createGuestBookingAction(guest, booking())).toEqual({
      success: false,
      error: 'booking.errors.outsideServiceArea',
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it('is rate limited per staff member', async () => {
    rateLimited.value = true;
    expect(await createGuestBookingAction(guest, booking())).toEqual({ success: false, error: 'errors.rateLimited' });
  });

  it('audits the booking without copying the customer’s personal details', async () => {
    await createGuestBookingAction(guest, booking());
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: STAFF_ID, action: 'shipment.create_for_guest', entityId: 'ship-1' }),
    );
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain(guest.phone);
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain(guest.name);
  });
});
