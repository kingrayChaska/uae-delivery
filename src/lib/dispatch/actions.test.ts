import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression tests for the "Reassign assigned two drivers" incident: every
// click on the reassign list used to be applied blindly (last write wins),
// so a few quick clicks moved the shipment back and forth between drivers.
// The fake below stands in for PostgREST: filters are evaluated when the
// query runs, and an UPDATE applies atomically to whatever rows still match.

type Row = { id: string; status: string; driver_id: string | null; tracking_number: string };

const SHIPMENT = '11111111-1111-4111-8111-111111111111';
const OTHER_SHIPMENT = '22222222-2222-4222-8222-222222222222';
const HASSAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ISMAILOU = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INACTIVE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERATOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const db = vi.hoisted(() => ({
  shipments: new Map<string, Row>(),
  activeDrivers: new Set<string>(),
  writes: 0,
  failNextUpdate: false,
  // When set, reads wait for this before resolving, so concurrent actions
  // can be made to read the same state before either one writes.
  readGate: null as Promise<void> | null,
}));

const role = vi.hoisted(() => ({ current: 'operator' as string }));
const audit = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: audit }));
vi.mock('@/services/drivers/list-available-drivers', () => ({ listAvailableDrivers: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(role.current)) throw new Error('Forbidden');
    return { id: OPERATOR, role: role.current };
  },
}));

vi.mock('@/lib/supabase/server', () => {
  type Filter = (row: Row) => boolean;

  const query = (kind: 'select' | 'update', values?: Partial<Row>) => {
    const filters: Filter[] = [];
    const builder = {
      eq: (col: keyof Row, value: unknown) => (filters.push((r) => r[col] === value), builder),
      is: (col: keyof Row, value: null) => (filters.push((r) => r[col] === value), builder),
      select: () => builder,
      maybeSingle: async () => {
        if (db.readGate) await db.readGate;
        const row = [...db.shipments.values()].find((r) => filters.every((f) => f(r)));
        return { data: row ? { ...row } : null, error: null };
      },
      then: (resolve: (value: unknown) => void) => {
        // An UPDATE: the matching set is decided at execution time.
        if (kind !== 'update') throw new Error('unsupported');
        if (db.failNextUpdate) {
          db.failNextUpdate = false;
          return resolve({ data: null, error: { code: '08006', message: 'connection failure' } });
        }
        if (values?.driver_id && !db.activeDrivers.has(values.driver_id)) {
          // The shipments_require_active_driver trigger (migration 0023).
          return resolve({ data: null, error: { code: 'P0001', message: 'Shipments can only be assigned to an active driver' } });
        }
        const matched = [...db.shipments.values()].filter((r) => filters.every((f) => f(r)));
        for (const row of matched) Object.assign(row, values);
        if (matched.length) db.writes += 1;
        resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
      },
    };
    return builder;
  };

  return {
    createClient: async () => ({
      from: () => ({
        select: () => query('select'),
        update: (values: Partial<Row>) => query('update', values),
      }),
    }),
  };
});

const { assignDriverAction, reassignDriverAction } = await import('@/lib/dispatch/actions');

const seed = (row: Partial<Row> & { id: string }) =>
  db.shipments.set(row.id, { status: 'confirmed', driver_id: null, tracking_number: 'PL7K29X4', ...row });

const snapshot = () => [...db.shipments.values()].map((r) => ({ ...r }));

beforeEach(() => {
  db.shipments.clear();
  db.activeDrivers = new Set([HASSAN, ISMAILOU]);
  db.writes = 0;
  db.failNextUpdate = false;
  db.readGate = null;
  role.current = 'operator';
  audit.mockClear();
});

describe('assignDriverAction', () => {
  it('assigns an unassigned shipment to exactly the chosen driver', async () => {
    seed({ id: SHIPMENT });
    expect(await assignDriverAction(SHIPMENT, HASSAN)).toEqual({ success: true });
    expect(db.shipments.get(SHIPMENT)).toMatchObject({ driver_id: HASSAN, status: 'assigned' });
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('a second assign (double-click, or a second operator) is rejected, not applied', async () => {
    seed({ id: SHIPMENT });
    db.readGate = Promise.resolve();
    const [first, second] = await Promise.all([assignDriverAction(SHIPMENT, HASSAN), assignDriverAction(SHIPMENT, ISMAILOU)]);

    expect([first.success, second.success].filter(Boolean)).toHaveLength(1);
    expect(db.writes).toBe(1);
    const winner = first.success ? HASSAN : ISMAILOU;
    expect(db.shipments.get(SHIPMENT)?.driver_id).toBe(winner);
    expect(audit).toHaveBeenCalledTimes(1);
  });
});

describe('reassignDriverAction', () => {
  it('moves the shipment from Driver A to Driver B only', async () => {
    seed({ id: SHIPMENT, status: 'assigned', driver_id: ISMAILOU });
    seed({ id: OTHER_SHIPMENT, status: 'assigned', driver_id: ISMAILOU });

    expect(await reassignDriverAction(SHIPMENT, HASSAN, ISMAILOU)).toEqual({ success: true });
    expect(db.shipments.get(SHIPMENT)).toMatchObject({ driver_id: HASSAN, status: 'assigned' });
    // The old driver's other shipments are untouched.
    expect(db.shipments.get(OTHER_SHIPMENT)?.driver_id).toBe(ISMAILOU);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ oldValue: { driverId: ISMAILOU }, newValue: { driverId: HASSAN } }),
    );
  });

  it('replays of the incident click sequence produce one change, not six', async () => {
    // Production, shipment B2BWBQGA: one page view, six accepted clicks.
    seed({ id: SHIPMENT, status: 'assigned', driver_id: ISMAILOU });
    const seenOnPage = ISMAILOU;
    const clicks = [ISMAILOU, HASSAN, HASSAN, HASSAN, ISMAILOU];
    const results = [];
    for (const driver of clicks) results.push(await reassignDriverAction(SHIPMENT, driver, seenOnPage));

    expect(results.map((r) => r.success)).toEqual([false, true, false, false, false]);
    expect(results[0]).toEqual({ success: false, error: 'operator.errors.alreadyAssigned' });
    expect(results[2]).toEqual({ success: false, error: 'operator.errors.assignmentChanged' });
    expect(db.writes).toBe(1);
    expect(db.shipments.get(SHIPMENT)?.driver_id).toBe(HASSAN);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('two operators reassigning at once: the first write wins, the second is told to refresh', async () => {
    seed({ id: SHIPMENT, status: 'assigned', driver_id: ISMAILOU });
    let release!: () => void;
    db.readGate = new Promise((resolve) => (release = resolve));

    const pending = Promise.all([
      reassignDriverAction(SHIPMENT, HASSAN, ISMAILOU),
      reassignDriverAction(SHIPMENT, HASSAN, ISMAILOU),
    ]);
    release();
    const results = await pending;

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.find((r) => !r.success)).toEqual({ success: false, error: 'operator.errors.assignmentChanged' });
    expect(db.writes).toBe(1);
    expect(db.shipments.get(SHIPMENT)?.driver_id).toBe(HASSAN);
  });

  it('two shipments reassigned independently each get their own driver', async () => {
    seed({ id: SHIPMENT, status: 'assigned', driver_id: ISMAILOU });
    seed({ id: OTHER_SHIPMENT, status: 'assigned', driver_id: HASSAN });
    const results = await Promise.all([
      reassignDriverAction(SHIPMENT, HASSAN, ISMAILOU),
      reassignDriverAction(OTHER_SHIPMENT, ISMAILOU, HASSAN),
    ]);
    expect(results).toEqual([{ success: true }, { success: true }]);
    expect(db.shipments.get(SHIPMENT)?.driver_id).toBe(HASSAN);
    expect(db.shipments.get(OTHER_SHIPMENT)?.driver_id).toBe(ISMAILOU);
  });

  it('allows retrying a failed delivery with the same driver (existing behaviour)', async () => {
    seed({ id: SHIPMENT, status: 'delivery_failed', driver_id: HASSAN });
    expect(await reassignDriverAction(SHIPMENT, HASSAN, HASSAN)).toEqual({ success: true });
    expect(db.shipments.get(SHIPMENT)).toMatchObject({ driver_id: HASSAN, status: 'assigned' });
  });

  it('rejects shipments past the reassignable states', async () => {
    seed({ id: SHIPMENT, status: 'picked_up', driver_id: ISMAILOU });
    const before = snapshot();
    expect(await reassignDriverAction(SHIPMENT, HASSAN, ISMAILOU)).toEqual({ success: false, error: 'operator.errors.cannotReassign' });
    expect(snapshot()).toEqual(before);
  });

  it.each([
    ['malformed shipment id', 'not-a-uuid', HASSAN, ISMAILOU, 'operator.errors.notFound'],
    ['malformed driver id', SHIPMENT, 'x', ISMAILOU, 'operator.errors.notFound'],
    ['malformed expected driver', SHIPMENT, HASSAN, 'x', 'operator.errors.notFound'],
    ['unknown shipment', OTHER_SHIPMENT, HASSAN, ISMAILOU, 'operator.errors.shipmentNotFound'],
  ])('%s: rejected with no change', async (_label, shipmentId, driverId, expected, error) => {
    seed({ id: SHIPMENT, status: 'assigned', driver_id: ISMAILOU });
    const before = snapshot();
    expect(await reassignDriverAction(shipmentId, driverId, expected)).toEqual({ success: false, error });
    expect(snapshot()).toEqual(before);
    expect(audit).not.toHaveBeenCalled();
  });

  it('an inactive or non-driver profile is refused by the database guard, with no change', async () => {
    seed({ id: SHIPMENT, status: 'assigned', driver_id: ISMAILOU });
    const before = snapshot();
    const result = await reassignDriverAction(SHIPMENT, INACTIVE, ISMAILOU);
    expect(result.success).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(audit).not.toHaveBeenCalled();
  });

  it('a database failure is reported as a failure, never as success', async () => {
    seed({ id: SHIPMENT, status: 'assigned', driver_id: ISMAILOU });
    db.failNextUpdate = true;
    const result = await reassignDriverAction(SHIPMENT, HASSAN, ISMAILOU);
    expect(result.success).toBe(false);
    expect(db.shipments.get(SHIPMENT)?.driver_id).toBe(ISMAILOU);
    expect(audit).not.toHaveBeenCalled();
  });

  it.each(['driver', 'customer'])('a %s cannot reassign', async (who) => {
    role.current = who;
    seed({ id: SHIPMENT, status: 'assigned', driver_id: ISMAILOU });
    await expect(reassignDriverAction(SHIPMENT, HASSAN, ISMAILOU)).rejects.toThrow('Forbidden');
    expect(db.shipments.get(SHIPMENT)?.driver_id).toBe(ISMAILOU);
  });
});
