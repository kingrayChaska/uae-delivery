import { describe, expect, it } from 'vitest';

import { getTerminalNegativeMessage, getTrackingMilestones } from '@/lib/shipment/tracking-milestones';

const done = (status: Parameters<typeof getTrackingMilestones>[0], history: Parameters<typeof getTrackingMilestones>[1] = []) =>
  getTrackingMilestones(status, history)
    .filter((m) => m.done)
    .map((m) => m.key);

describe('getTrackingMilestones', () => {
  it('uses the six customer-facing steps in order', () => {
    expect(getTrackingMilestones('confirmed').map((m) => m.label)).toEqual([
      'Booking created',
      'Driver assigned',
      'Shipment received',
      'In transit',
      'Out for delivery',
      'Delivered',
    ]);
  });

  it.each([
    ['pending_payment', ['created']],
    ['confirmed', ['created']],
    ['driver_accepted', ['created', 'assigned']],
    ['picked_up', ['created', 'assigned', 'received']],
    ['in_transit', ['created', 'assigned', 'received', 'in_transit']],
    ['arrived_destination', ['created', 'assigned', 'received', 'in_transit', 'out_for_delivery']],
    ['delivered', ['created', 'assigned', 'received', 'in_transit', 'out_for_delivery', 'delivered']],
  ] as const)('%s -> %j', (status, expected) => {
    expect(done(status)).toEqual(expected);
  });

  it('marks only the latest reached step as current', () => {
    const milestones = getTrackingMilestones('in_transit');
    expect(milestones.filter((m) => m.current).map((m) => m.key)).toEqual(['in_transit']);
  });

  it('stamps each step with the first time it was reached', () => {
    const history = [
      { status: 'confirmed' as const, createdAt: '2026-09-01T08:00:00Z' },
      { status: 'assigned' as const, createdAt: '2026-09-01T08:10:00Z' },
      { status: 'confirmed' as const, createdAt: '2026-09-01T08:20:00Z' },
      { status: 'assigned' as const, createdAt: '2026-09-01T08:30:00Z' },
      { status: 'picked_up' as const, createdAt: '2026-09-01T09:00:00Z' },
    ];
    const byKey = Object.fromEntries(getTrackingMilestones('picked_up', history).map((m) => [m.key, m.reachedAt]));
    expect(byKey).toMatchObject({
      created: '2026-09-01T08:00:00Z',
      assigned: '2026-09-01T08:10:00Z',
      received: '2026-09-01T09:00:00Z',
      in_transit: null,
    });
  });

  it('shows how far a cancelled shipment got, with no current step', () => {
    const history = [
      { status: 'confirmed' as const, createdAt: '2026-09-01T08:00:00Z' },
      { status: 'assigned' as const, createdAt: '2026-09-01T08:10:00Z' },
      { status: 'cancelled' as const, createdAt: '2026-09-01T08:15:00Z' },
    ];
    expect(done('cancelled', history)).toEqual(['created', 'assigned']);
    expect(getTrackingMilestones('cancelled', history).some((m) => m.current)).toBe(false);
    expect(getTerminalNegativeMessage('cancelled')).toBe('This shipment was cancelled.');
  });
});
