import { describe, expect, it } from 'vitest';

import {
  CORRECTION_TARGETS,
  correctionTargets,
  effectiveStatusHistory,
  statusCorrectionSchema,
} from '@/lib/shipment/status-corrections';
import { getTrackingMilestones } from '@/lib/shipment/tracking-milestones';
import { SHIPMENT_STATUSES } from '@/lib/types';

import type { ShipmentStatus } from '@/lib/types';

// The rule is written out again here, independently of the code, so the
// test can disagree with it. It must also match the database
// (shipment_status_correction_targets, migration 0041; database/test/status-corrections.sql).
const IN_PROGRESS: ShipmentStatus[] = ['assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination'];
const expectedTargets = (from: ShipmentStatus, isManager: boolean): ShipmentStatus[] => {
  const correctable = [...IN_PROGRESS, 'delivery_failed'].includes(from) || (isManager && ['cancelled', 'returned'].includes(from));
  return correctable ? IN_PROGRESS.filter((status) => status !== from) : [];
};

describe('correctionTargets', () => {
  it.each(SHIPMENT_STATUSES.flatMap((status) => [[status, false], [status, true]] as const))(
    'from %s (manager: %s)',
    (from, isManager) => {
      expect(correctionTargets(from, { isManager, hasDriver: true })).toEqual(expectedTargets(from, isManager));
    },
  );

  it('offers Assigned when a driver tapped In Transit by mistake', () => {
    expect(correctionTargets('in_transit', { isManager: false, hasDriver: true })).toContain('assigned');
  });

  it('never offers Delivered, and never corrects a delivered shipment', () => {
    for (const status of SHIPMENT_STATUSES) {
      expect(correctionTargets(status, { isManager: true, hasDriver: true })).not.toContain('delivered');
    }
    expect(correctionTargets('delivered', { isManager: true, hasDriver: true })).toEqual([]);
  });

  it('leaves cancelled and returned shipments to managers', () => {
    expect(correctionTargets('cancelled', { isManager: false, hasDriver: true })).toEqual([]);
    expect(correctionTargets('returned', { isManager: false, hasDriver: true })).toEqual([]);
    expect(correctionTargets('returned', { isManager: true, hasDriver: true })).toEqual(IN_PROGRESS);
  });

  it('needs a driver', () => {
    expect(correctionTargets('in_transit', { isManager: true, hasDriver: false })).toEqual([]);
  });

  it('never offers the current status or anything outside the driver workflow', () => {
    for (const status of SHIPMENT_STATUSES) {
      const targets = correctionTargets(status, { isManager: true, hasDriver: true });
      expect(targets).not.toContain(status);
      expect(targets.every((target) => CORRECTION_TARGETS.includes(target))).toBe(true);
    }
  });
});

describe('statusCorrectionSchema', () => {
  const valid = {
    shipmentId: '11111111-1111-4111-8111-111111111111',
    expectedStatus: 'in_transit',
    newStatus: 'assigned',
    reason: 'Driver marked In Transit before pickup',
  } as const;

  it('accepts a correction with a reason', () => {
    expect(statusCorrectionSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['no reason', { reason: '   ' }, 'operator.validation.correctionReason'],
    ['a too-short reason', { reason: 'oops' }, 'operator.validation.correctionReason'],
    ['a too-long reason', { reason: 'x'.repeat(501) }, 'operator.validation.reasonTooLong'],
  ])('rejects %s', (_label, change, message) => {
    const result = statusCorrectionSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it('rejects a status that does not exist', () => {
    expect(statusCorrectionSchema.safeParse({ ...valid, newStatus: 'teleported' }).success).toBe(false);
  });

  it('rejects a malformed shipment id', () => {
    expect(statusCorrectionSchema.safeParse({ ...valid, shipmentId: '1; drop table shipments' }).success).toBe(false);
  });
});

const at = (minute: number) => `2026-10-10T08:${String(minute).padStart(2, '0')}:00Z`;
const step = (status: ShipmentStatus, minute: number, eventType: 'transition' | 'correction' = 'transition') => ({
  status,
  createdAt: at(minute),
  eventType,
});

describe('effectiveStatusHistory', () => {
  it('drops the steps a correction undid, keeping the original time of the status it returned to', () => {
    const history = [
      step('confirmed', 0),
      step('assigned', 1),
      step('driver_accepted', 2),
      step('arrived_pickup', 3),
      step('picked_up', 4),
      step('in_transit', 5),
      step('arrived_pickup', 9, 'correction'),
    ];
    expect(effectiveStatusHistory(history).map((entry) => `${entry.status}@${entry.createdAt.slice(14, 16)}`)).toEqual([
      'confirmed@00',
      'assigned@01',
      'driver_accepted@02',
      'arrived_pickup@03',
    ]);
  });

  it('keeps a correction to a status the shipment never had as its own step', () => {
    const history = [step('confirmed', 0), step('assigned', 1), step('in_transit', 2, 'correction')];
    expect(effectiveStatusHistory(history).map((entry) => entry.status)).toEqual(['confirmed', 'assigned', 'in_transit']);
  });

  it('leaves an uncorrected history alone', () => {
    const history = [step('confirmed', 0), step('assigned', 1), step('driver_accepted', 2)];
    expect(effectiveStatusHistory(history)).toEqual(history);
  });

  it('treats history without event types (older rows) as plain transitions', () => {
    const history = [{ status: 'confirmed' as const, createdAt: at(0) }, { status: 'assigned' as const, createdAt: at(1) }];
    expect(effectiveStatusHistory(history)).toEqual(history);
  });
});

describe('tracking milestones after a correction', () => {
  it('does not show In transit as reached once it was corrected away', () => {
    const history = [
      step('confirmed', 0),
      step('assigned', 1),
      step('driver_accepted', 2),
      step('arrived_pickup', 3),
      step('picked_up', 4),
      step('in_transit', 5),
      step('assigned', 9, 'correction'),
    ];
    const milestones = getTrackingMilestones('assigned', history);
    expect(milestones.find((m) => m.key === 'in_transit')).toMatchObject({ done: false, reachedAt: null });
    expect(milestones.find((m) => m.key === 'received')).toMatchObject({ done: false });
    expect(milestones.find((m) => m.key === 'assigned')).toMatchObject({ done: true, current: true, reachedAt: at(1) });
  });

  it('uses the real time once the shipment genuinely reaches the status again', () => {
    const history = [
      step('confirmed', 0),
      step('assigned', 1),
      step('driver_accepted', 2),
      step('arrived_pickup', 3),
      step('picked_up', 4),
      step('in_transit', 5),
      step('arrived_pickup', 6, 'correction'),
      step('picked_up', 20),
      step('in_transit', 30),
    ];
    const milestones = getTrackingMilestones('in_transit', history);
    expect(milestones.find((m) => m.key === 'in_transit')?.reachedAt).toBe(at(30));
    expect(milestones.find((m) => m.key === 'received')?.reachedAt).toBe(at(20));
  });

  it('does not count a corrected-away step on a shipment that later stopped', () => {
    const history = [
      step('confirmed', 0),
      step('assigned', 1),
      step('driver_accepted', 2),
      step('arrived_pickup', 3),
      step('picked_up', 4),
      step('arrived_pickup', 5, 'correction'),
      step('cancelled', 6),
    ];
    const milestones = getTrackingMilestones('cancelled', history);
    expect(milestones.find((m) => m.key === 'received')?.done).toBe(false);
  });
});
