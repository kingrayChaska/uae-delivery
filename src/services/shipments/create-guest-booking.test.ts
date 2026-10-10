import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MultiBookingInput } from '@/lib/shipment/schemas';

// createGuestBooking (migration 0040): routing, coverage and pricing are
// the shared quoteShipment(), faked here; what's checked is how a guest
// booking uses them — priced as an individual, nothing inserted unless
// every shipment can be booked, and a retry returning the original
// shipment instead of a second one.

const STAFF_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const existing = vi.hoisted(() => new Map<string, { id: string; price: number }>());
const quoteShipment = vi.hoisted(() => vi.fn());
const insertQuotedShipment = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/services/bulk/create-batch', () => ({ openBatch: vi.fn(), finalizeBatch: vi.fn() }));
vi.mock('@/lib/pricing/get-active-rule', () => ({ getActivePricingRules: async () => ({ individual: {}, merchant: {} }) }));
vi.mock('@/services/shipments/create-shipment', async () => {
  const guestBookingCustomer = (guest: { name: string; phone: string }, bookedBy: string) => ({
    id: null,
    accountType: 'individual',
    merchantBusinessAccountId: null,
    guest: { name: guest.name.trim(), phone: guest.phone.trim(), bookedBy },
  });
  return {
    guestBookingCustomer,
    findExistingBooking: async (_customer: unknown, requestId: string) => existing.get(requestId) ?? null,
    findByClientRequestId: vi.fn(),
    getBookingCustomer: vi.fn(),
    quoteShipment,
    insertQuotedShipment,
  };
});

const { createGuestBooking } = await import('@/services/shipments/create-booking');

const shipment = (requestId: string, description = 'Shoes') => ({
  pickup: { address: 'Al Barsha', lat: 25.09, lng: 55.14, contactName: 'Wanda', contactPhone: '0559091234' },
  dropoff: { address: 'Business Bay', lat: 25.18, lng: 55.27, contactName: 'Rami', contactPhone: '0507770000' },
  deliveryType: 'same_day' as const,
  packageType: 'parcel' as const,
  packageDescription: description,
  packageQuantity: 1,
  packageWeightKg: 1,
  isFragile: false,
  recipientPaymentType: 'prepaid' as const,
  clientRequestId: requestId,
});

const input = (...shipments: ReturnType<typeof shipment>[]): MultiBookingInput => ({
  shipments,
  paymentMethod: 'cod',
  clientRequestId: '99999999-0000-4000-8000-0000000000aa',
});

const guest = { name: '  Wanda WhatsApp ', phone: '+971 55 909 1234' };

beforeEach(() => {
  existing.clear();
  quoteShipment.mockReset().mockImplementation(async (_customer, s) => ({ input: s, price: 21.6 }));
  insertQuotedShipment.mockReset().mockImplementation(async (_customer, quote) => ({
    id: `new-${quote.input.clientRequestId}`,
    price: 21.6,
  }));
});

describe('createGuestBooking', () => {
  it('prices the guest as an individual, with their details and the booker on the shipment', async () => {
    const outcome = await createGuestBooking({ guest, bookedBy: STAFF_ID, input: input(shipment('r1')) });
    const customer = quoteShipment.mock.calls[0][0];
    expect(customer).toEqual({
      id: null,
      accountType: 'individual',
      merchantBusinessAccountId: null,
      guest: { name: 'Wanda WhatsApp', phone: '+971 55 909 1234', bookedBy: STAFF_ID },
    });
    expect(insertQuotedShipment.mock.calls[0][0]).toBe(customer);
    expect(outcome).toMatchObject({ batchId: null, total: 21.6, failed: [] });
    expect(outcome.shipments.map((s) => s.id)).toEqual(['new-r1']);
  });

  it('books nothing when any shipment fails pricing or coverage', async () => {
    quoteShipment.mockImplementation(async (_customer, s) => {
      if (s.packageDescription === 'far') throw new Error('booking.errors.distanceLimit');
      return { input: s, price: 21.6 };
    });
    await expect(
      createGuestBooking({ guest, bookedBy: STAFF_ID, input: input(shipment('r1'), shipment('r2', 'far')) }),
    ).rejects.toThrow('booking.errors.distanceLimit');
    expect(insertQuotedShipment).not.toHaveBeenCalled();
  });

  it('returns the original shipment for a retried submission, without re-quoting', async () => {
    existing.set('r1', { id: 'already-booked', price: 21.6 });
    const outcome = await createGuestBooking({ guest, bookedBy: STAFF_ID, input: input(shipment('r1')) });
    expect(outcome.shipments.map((s) => s.id)).toEqual(['already-booked']);
    expect(quoteShipment).not.toHaveBeenCalled();
    expect(insertQuotedShipment).not.toHaveBeenCalled();
  });

  it('books only the shipments a partial retry is missing', async () => {
    existing.set('r1', { id: 'already-booked', price: 21.6 });
    const outcome = await createGuestBooking({ guest, bookedBy: STAFF_ID, input: input(shipment('r1'), shipment('r2')) });
    expect(insertQuotedShipment).toHaveBeenCalledOnce();
    expect(outcome.shipments.map((s) => s.id).sort()).toEqual(['already-booked', 'new-r2']);
  });

  it('books several shipments separately, never as a batch', async () => {
    const outcome = await createGuestBooking({ guest, bookedBy: STAFF_ID, input: input(shipment('r1'), shipment('r2')) });
    expect(outcome.batchId).toBeNull();
    expect(insertQuotedShipment.mock.calls.every((call) => call.length === 2)).toBe(true);
    expect(outcome.total).toBe(43.2);
  });

  it('reports a shipment the database refused, keeping the ones it accepted', async () => {
    insertQuotedShipment.mockImplementation(async (_customer, quote) => {
      if (quote.input.clientRequestId === 'r2') throw new Error('errors.db.distanceLimit');
      return { id: `new-${quote.input.clientRequestId}`, price: 21.6 };
    });
    const outcome = await createGuestBooking({ guest, bookedBy: STAFF_ID, input: input(shipment('r1'), shipment('r2')) });
    expect(outcome.shipments.map((s) => s.id)).toEqual(['new-r1']);
    expect(outcome.failed).toEqual([{ index: 1, message: 'errors.db.distanceLimit' }]);
  });

  it('fails outright when nothing could be booked', async () => {
    insertQuotedShipment.mockRejectedValue(new Error('errors.db.distanceLimit'));
    await expect(createGuestBooking({ guest, bookedBy: STAFF_ID, input: input(shipment('r1')) })).rejects.toThrow(
      'errors.db.distanceLimit',
    );
  });
});
