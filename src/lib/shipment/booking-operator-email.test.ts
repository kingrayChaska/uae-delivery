import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MultiBookingInput } from '@/lib/shipment/schemas';

// The booking actions only hand off to the operator email sender after a
// booking succeeded; which bookings get an email is decided by the
// database (migration 0043, database/test/operator-booking-emails.sql).

const CUSTOMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const createBooking = vi.hoisted(() => vi.fn());
const schedule = vi.hoisted(() => vi.fn());
const rateLimited = vi.hoisted(() => ({ value: false }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/security/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/lib/security/rate-limit', () => ({
  RATE_LIMIT_MESSAGE: 'errors.rateLimited',
  checkRateLimit: async () => !rateLimited.value,
  checkIpRateLimit: async () => true,
}));
vi.mock('@/services/tracking/get-shipment-tracking', () => ({ getShipmentTracking: vi.fn() }));
vi.mock('@/services/shipments/create-booking', () => ({ createBooking, createGuestBooking: vi.fn() }));
vi.mock('@/services/notifications/operator-booking-emails', () => ({ scheduleOperatorBookingEmails: schedule }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async () => ({ id: CUSTOMER_ID, role: 'customer' }),
}));

const { createBookingAction } = await import('@/lib/shipment/actions');

const location = (address: string, lat: number, lng: number) => ({ address, lat, lng, contactName: 'Aisha', contactPhone: '+971 50 123 4567' });

const booking = (): MultiBookingInput => ({
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
      recipientPaymentType: 'prepaid',
      clientRequestId: '99999999-0000-4000-8000-000000000001',
    },
  ],
  paymentMethod: 'cod',
  clientRequestId: '99999999-0000-4000-8000-000000000002',
}) as MultiBookingInput;

beforeEach(() => {
  createBooking.mockReset();
  schedule.mockReset();
  rateLimited.value = false;
});

describe('createBookingAction and the operator email', () => {
  it('sends the queued email after a successful booking', async () => {
    createBooking.mockResolvedValue({ shipments: [{ id: 's1', price: 12 }], batchId: null, reference: null, total: 12, failed: [] });
    const result = await createBookingAction(booking());
    expect(result.success).toBe(true);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the booking fails', async () => {
    createBooking.mockRejectedValue(new Error('booking.errors.outsideUae'));
    const result = await createBookingAction(booking());
    expect(result).toEqual({ success: false, error: 'booking.errors.outsideUae' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('sends nothing when the booking is refused before it starts', async () => {
    rateLimited.value = true;
    expect((await createBookingAction(booking())).success).toBe(false);

    rateLimited.value = false;
    expect((await createBookingAction({ ...booking(), shipments: [] })).success).toBe(false);
    expect(createBooking).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
});
