import { describe, expect, it } from 'vitest';

import { NOTIFICATION_KEYS, localizeNotification } from '@/lib/notifications/localize';
import enNotifications from '../../../messages/en/notifications.json';
import arNotifications from '../../../messages/ar/notifications.json';

describe('notification texts', () => {
  // notification-item.tsx reads notifications.types.<key>.title / .body; a
  // key added anywhere else shows a missing-message placeholder instead.
  it.each([
    ['en', enNotifications],
    ['ar', arNotifications],
  ])('every recognised notification has a title and body under types (%s)', (_locale, messages) => {
    const types = (messages as { types: Record<string, { title?: string; body?: string; bodyWithDate?: string }> }).types;
    const missing = NOTIFICATION_KEYS.filter((key) => !types[key]?.title || !(types[key]?.body || types[key]?.bodyWithDate));
    expect(missing).toEqual([]);
  });
});

describe('cash notifications (migration 0048)', () => {
  const read = (type: string, body: string) => localizeNotification({ type, title: '', body });

  it('reads the switch to cash', () => {
    expect(read('shipment.switched_to_cash', 'PL7K29X4 will be paid in cash and is waiting for a driver.')).toEqual({
      key: 'switchedToCash',
      values: { code: 'PL7K29X4' },
    });
  });

  it.each(['driver', 'operator'])('reads every %s remittance step, with names, numbers and amounts', (level) => {
    expect(
      read(`cash.${level}_remittance_submitted`, 'Drv Nine submitted DRM-2026-000004 (AED 220.00) — confirm it when you receive the cash.'),
    ).toEqual({
      key: level === 'driver' ? 'driverRemittanceSubmitted' : 'operatorRemittanceSubmitted',
      values: { name: 'Drv Nine', number: 'DRM-2026-000004', amount: '220.00' },
    });
    expect(read(`cash.${level}_remittance_confirmed`, 'DRM-2026-000004 (AED 220.00) was confirmed by Op Nine.')).toEqual({
      key: 'remittanceConfirmed',
      values: { number: 'DRM-2026-000004', amount: '220.00', name: 'Op Nine' },
    });
    expect(
      read(
        `cash.${level}_remittance_discrepancy`,
        'DRM-2026-000005: Op Nine B counted AED 10.00 of AED 15.00. The difference stays on your balance.',
      ),
    ).toEqual({
      key: 'remittanceDiscrepancy',
      values: { number: 'DRM-2026-000005', name: 'Op Nine B', counted: '10.00', submitted: '15.00' },
    });
    expect(read(`cash.${level}_remittance_disputed`, 'DRM-2026-000006 was disputed by Op Nine. The amount stays on your balance.')).toEqual({
      key: 'remittanceDisputed',
      values: { number: 'DRM-2026-000006', name: 'Op Nine' },
    });
  });
});

// Bodies exactly as the database triggers write them.
describe('localizeNotification', () => {
  it('pulls the tracking ID out of shipment updates', () => {
    expect(localizeNotification({ type: 'shipment.booked', title: 'Booking created', body: 'Your shipment PL7K29X4 has been booked.' })).toEqual({
      key: 'booked',
      values: { code: 'PL7K29X4' },
    });
    expect(localizeNotification({ type: 'shipment.in_transit', title: 'Parcel in transit', body: 'PL7K29X4 is on its way.' })?.values.code).toBe(
      'PL7K29X4',
    );
    expect(localizeNotification({ type: 'shipment.assigned', title: 'New delivery assigned', body: "You've been assigned PL7K29X4." })?.key).toBe(
      'assigned',
    );
    expect(
      localizeNotification({ type: 'shipment.unassigned', title: 'Delivery reassigned', body: 'PL7K29X4 has been reassigned to another driver.' }),
    ).toEqual({ key: 'unassigned', values: { code: 'PL7K29X4' } });
  });

  it('tells apart the customer and staff versions of the same event', () => {
    expect(
      localizeNotification({ type: 'shipment.delivery_failed', title: 'Delivery failed', body: 'A delivery attempt for PL7K29X4 failed.' })?.key,
    ).toBe('deliveryFailed');
    expect(
      localizeNotification({
        type: 'shipment.delivery_failed',
        title: 'Delivery failed — needs attention',
        body: 'PL7K29X4 failed delivery and needs action.',
      })?.key,
    ).toBe('deliveryFailedStaff');
  });

  it('reads driver cancellations and returns, for the customer and for staff', () => {
    const read = (type: string, title: string, body: string) => localizeNotification({ type, title, body });
    expect(read('shipment.cancelled_by_driver', 'Shipment cancelled', 'PL7K29X4 was cancelled by the driver.')).toEqual({
      key: 'cancelledByDriver',
      values: { code: 'PL7K29X4' },
    });
    expect(
      read('shipment.cancelled_by_driver', 'Driver cancelled a shipment', 'PL7K29X4 was cancelled by the driver before pickup.')?.key,
    ).toBe('cancelledByDriverStaff');
    expect(read('shipment.returned', 'Shipment returned', 'PL7K29X4 is being returned to the sender.')?.key).toBe('returned');
    expect(
      read('shipment.returned', 'Driver returned a shipment', 'PL7K29X4 was not delivered and is being returned to the sender.')?.key,
    ).toBe('returnedStaff');
  });

  it('reads cancellations and price changes by operations (0046)', () => {
    const read = (type: string, title: string, body: string) => localizeNotification({ type, title, body });
    expect(read('shipment.cancelled_by_operations', 'Shipment cancelled', 'PL7K29X4 was cancelled by ParcelLink operations.')).toEqual({
      key: 'cancelledByOperations',
      values: { code: 'PL7K29X4' },
    });
    expect(
      read(
        'shipment.cancelled_by_operations',
        'Delivery cancelled',
        'PL7K29X4 was cancelled by operations and is no longer on your deliveries.',
      )?.key,
    ).toBe('cancelledByOperationsDriver');
    expect(
      read('shipment.price_adjusted', 'Delivery price updated', 'The delivery price for PL7K29X4 changed from AED 21.60 to AED 30.00.'),
    ).toEqual({ key: 'priceAdjusted', values: { code: 'PL7K29X4', from: '21.60', to: '30.00' } });
  });

  it('keeps the delivery code', () => {
    expect(
      localizeNotification({
        type: 'delivery.otp',
        title: 'Delivery verification code',
        body: 'Share this code with your driver to confirm delivery of PL7K29X4: 482913',
      }),
    ).toEqual({ key: 'deliveryOtp', values: { code: 'PL7K29X4', otp: '482913' } });
  });

  it('reads booking summaries, with or without a pickup date', () => {
    expect(
      localizeNotification({ type: 'batch.submitted', title: 'Shipments booked', body: 'BK-26-0042: 3 of 4 shipments booked.' }),
    ).toEqual({ key: 'batchBooked', values: { reference: 'BK-26-0042', created: '3', total: '4' } });
    expect(
      localizeNotification({
        type: 'batch.submitted',
        title: 'New multi-shipment booking',
        body: 'Sara Ahmed booked 3 shipments (BK-26-0042) for pickup on 05 Oct 2026.',
      }),
    ).toEqual({ key: 'batchNewBooking', values: { sender: 'Sara Ahmed', count: '3', reference: 'BK-26-0042', date: '05 Oct 2026' } });
    expect(
      localizeNotification({ type: 'batch.submitted', title: 'New multi-shipment booking', body: 'A customer booked 2 shipments (BK-26-0043).' })
        ?.values.date,
    ).toBe('');
  });

  it("keeps the manager's note on a merchant decision", () => {
    expect(
      localizeNotification({
        type: 'merchant.requires_changes',
        title: 'Your Merchant application requires attention',
        body: 'Please upload a clearer trade licence. Update your application and resubmit it from the Merchant page.',
      }),
    ).toEqual({ key: 'merchantChanges', values: { note: 'Please upload a clearer trade licence.' } });
  });

  it('shows anything unrecognised as stored', () => {
    expect(localizeNotification({ type: 'shipment.booked', title: 'Booking created', body: 'Something new' })).toBeNull();
    expect(localizeNotification({ type: 'system.announcement', title: 'Hello', body: 'World' })).toBeNull();
  });
});
