import { describe, expect, it } from 'vitest';

import { newTotalFor, STAFF_CANCELLABLE } from '@/lib/shipment/staff-actions';
import { SHIPMENT_STATUSES } from '@/lib/types';

// Mirrors of the 0046 rules the dialogs use before asking the server.

describe('newTotalFor', () => {
  it('adds the unchanged weight and COD-handling charges to the new service charge, in fils', () => {
    expect(newTotalFor({ weightCharge: 3.3, codCharge: 2.1 }, 10.1)).toBe(15.5);
    expect(newTotalFor({ weightCharge: null, codCharge: null }, 30)).toBe(30);
  });

  it('never adds the goods money collected from the recipient', () => {
    // The shape has no cod_amount at all: the price can't include it.
    expect(newTotalFor({ weightCharge: 0, codCharge: 5 }, 0)).toBe(5);
  });
});

describe('STAFF_CANCELLABLE', () => {
  it('matches shipment_cancel_block(): before pickup only', () => {
    expect([...STAFF_CANCELLABLE].sort()).toEqual(['arrived_pickup', 'assigned', 'confirmed', 'driver_accepted', 'pending_payment']);
    for (const status of ['picked_up', 'in_transit', 'arrived_destination', 'delivery_failed', 'delivered', 'cancelled', 'returned']) {
      expect(SHIPMENT_STATUSES).toContain(status);
      expect(STAFF_CANCELLABLE).not.toContain(status);
    }
  });
});
