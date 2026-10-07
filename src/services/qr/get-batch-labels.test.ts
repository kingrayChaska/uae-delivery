import { beforeEach, describe, expect, it, vi } from 'vitest';

// getBatchLabels with an in-memory stand-in for the caller's Supabase
// session. Ownership is ALSO enforced by RLS and get_batch_qr_tokens in
// the database (database/test/customer-search.sql); this covers what the
// app does with the answers: which labels, in what order, in parts, and
// refusing to print an incomplete set.

vi.mock('server-only', () => ({}));

type Row = Record<string, unknown>;
const db: { shipment_batches: Row[]; shipments: Row[]; tokens: Map<string, string | null> } = {
  shipment_batches: [],
  shipments: [],
  tokens: new Map(),
};

const query = (table: 'shipment_batches' | 'shipments') => {
  let rows = [...db[table]];
  let head = false;
  let range: [number, number] | null = null;
  const builder = {
    select: (_columns: string, options?: { head?: boolean }) => {
      head = Boolean(options?.head);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    order: () => builder,
    range: (from: number, to: number) => {
      range = [from, to];
      return builder;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => void) => {
      const data = range ? rows.slice(range[0], range[1] + 1) : rows;
      resolve(head ? { count: rows.length, error: null } : { data, error: null });
    },
  };
  return builder;
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: query,
    rpc: async (name: string, args: { p_batch_id: string }) => {
      expect(name).toBe('get_batch_qr_tokens');
      const data = db.shipments
        .filter((s) => s.batch_id === args.p_batch_id && db.tokens.has(s.id as string))
        .map((s) => ({ shipment_id: s.id, qr_token: db.tokens.get(s.id as string) }));
      return { data, error: null };
    },
  }),
}));

const { getBatchLabels, LABELS_PER_PART } = await import('@/services/qr/get-shipment-label-data');

const MERCHANT = 'merchant-a';
const OTHER = 'merchant-b';
const BATCH = 'batch-1';

const shipment = (n: number, overrides: Row = {}): Row => ({
  id: `s${n}`,
  batch_id: BATCH,
  customer_id: MERCHANT,
  tracking_number: `PL${String(n).padStart(4, '0')}`,
  pickup_address: 'Warehouse, Al Quoz, Dubai',
  pickup_contact_name: 'Shop A',
  pickup_contact_phone: '04 111 2222',
  pickup_building: null,
  pickup_unit: null,
  pickup_floor: null,
  pickup_instructions: null,
  dropoff_address: `Recipient ${n} address`,
  dropoff_contact_name: `Recipient ${n}`,
  dropoff_contact_phone: '0501234567',
  dropoff_building: null,
  dropoff_unit: null,
  dropoff_floor: null,
  dropoff_instructions: null,
  delivery_type: 'next_day',
  delivery_date: '2026-10-07',
  price: 15,
  currency: 'AED',
  business_account_id: 'business-a',
  customer: { account_type: 'merchant' },
  rule: { account_type: 'merchant' },
  payment_method: 'card',
  recipient_payment_type: 'postpaid',
  cod_amount: 120,
  package_type: 'parcel',
  package_description: 'Box',
  package_quantity: 1,
  package_weight_kg: '2.50',
  package_length_cm: null,
  package_width_cm: null,
  package_height_cm: null,
  is_fragile: false,
  ...overrides,
});

const seed = (count: number) => {
  db.shipments = Array.from({ length: count }, (_, i) => shipment(i + 1));
  db.tokens = new Map(db.shipments.map((s) => [s.id as string, `token-${s.id}`]));
};

beforeEach(() => {
  db.shipment_batches = [{ id: BATCH, customer_id: MERCHANT, reference: 'BLK-20261006-ABCD' }];
  seed(0);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getBatchLabels', () => {
  it("refuses another merchant's batch", async () => {
    seed(3);
    expect(await getBatchLabels(BATCH, OTHER, 1)).toBeNull();
    expect(await getBatchLabels('no-such-batch', MERCHANT, 1)).toBeNull();
  });

  it('says so when the batch has no shipments', async () => {
    expect(await getBatchLabels(BATCH, MERCHANT, 1)).toEqual({ status: 'empty', reference: 'BLK-20261006-ABCD' });
  });

  it.each([1, 2, 10, 25])('makes every label of a %i-shipment batch, in order, in one part', async (count) => {
    seed(count);
    const result = await getBatchLabels(BATCH, MERCHANT, 1);
    expect(result?.status).toBe('ready');
    if (result?.status !== 'ready') return;
    expect(result.parts).toBe(1);
    expect(result.labels.map((label) => label.trackingNumber)).toEqual(db.shipments.map((s) => s.tracking_number));
    // Each label is that shipment's own: recipient, pickup, its own QR code.
    result.labels.forEach((label, i) => {
      expect(label.dropoffContactName).toBe(`Recipient ${i + 1}`);
      expect(label.pickupAddress).toBe('Warehouse, Al Quoz, Dubai');
      expect(label.qrSvg).toContain('<svg');
    });
    expect(new Set(result.labels.map((label) => label.qrSvg)).size).toBe(count);
  });

  it('never prints the delivery fee on a merchant label', async () => {
    seed(3);
    const result = await getBatchLabels(BATCH, MERCHANT, 1);
    expect(result?.status === 'ready' && result.labels.every((label) => label.deliveryFee === null)).toBe(true);
    // What the recipient pays is still there.
    expect(result?.status === 'ready' && result.labels[0].codAmount).toBe(120);
  });

  it.each([
    ['a business account', { customer: null, rule: null }],
    ['a merchant booking customer', { business_account_id: null, rule: null }],
    ['a merchant pricing rule', { business_account_id: null, customer: null }],
  ])('leaves the fee off when only %s marks it a merchant shipment', async (_label, overrides) => {
    db.shipments = [shipment(1, overrides)];
    db.tokens = new Map([['s1', 'token-s1']]);
    const result = await getBatchLabels(BATCH, MERCHANT, 1);
    expect(result?.status === 'ready' && result.labels[0].deliveryFee).toBeNull();
  });

  it("still prints an individual customer's fee", async () => {
    db.shipments = [
      shipment(1, { business_account_id: null, customer: { account_type: 'individual' }, rule: { account_type: 'individual' }, price: '21.60' }),
    ];
    db.tokens = new Map([['s1', 'token-s1']]);
    const result = await getBatchLabels(BATCH, MERCHANT, 1);
    expect(result?.status === 'ready' && result.labels[0].deliveryFee).toBe(21.6);
  });

  it('prints a large batch in parts, every shipment exactly once', async () => {
    seed(LABELS_PER_PART * 2 + 37);
    const seen: string[] = [];
    for (let part = 1; part <= 3; part++) {
      const result = await getBatchLabels(BATCH, MERCHANT, part);
      expect(result?.status).toBe('ready');
      if (result?.status !== 'ready') return;
      expect(result.parts).toBe(3);
      expect(result.part).toBe(part);
      expect(result.first).toBe((part - 1) * LABELS_PER_PART + 1);
      seen.push(...result.labels.map((label) => label.trackingNumber));
    }
    expect(seen).toEqual(db.shipments.map((s) => s.tracking_number));
  });

  it('keeps a hand-edited part number in range', async () => {
    seed(5);
    const result = await getBatchLabels(BATCH, MERCHANT, 99);
    expect(result?.status === 'ready' && result.part).toBe(1);
  });

  it('prints nothing, and names the shipment, when a label is missing its QR code', async () => {
    seed(4);
    db.tokens.delete('s3');
    const result = await getBatchLabels(BATCH, MERCHANT, 1);
    expect(result).toEqual({ status: 'incomplete', reference: 'BLK-20261006-ABCD', failed: ['PL0003'], total: 4 });
  });

  it('gives the same labels on a repeated download', async () => {
    seed(6);
    const first = await getBatchLabels(BATCH, MERCHANT, 1);
    const again = await getBatchLabels(BATCH, MERCHANT, 1);
    expect(again).toEqual(first);
  });
});
