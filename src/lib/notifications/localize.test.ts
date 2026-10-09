import { describe, expect, it } from 'vitest';

import { localizeNotification } from '@/lib/notifications/localize';

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
