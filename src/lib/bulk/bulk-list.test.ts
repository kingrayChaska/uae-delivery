import { describe, expect, it } from 'vitest';

import { validateBulkRecords } from '@/lib/business/schemas';
import {
  applyPickupDefaults,
  bulkBatchDetailsSchema,
  missingCustomerBulkColumns,
  sanitizeBulkRecords,
  todayInUae,
} from '@/lib/bulk/schemas';

const DEFAULT_PICKUP = {
  pickup_address: 'Warehouse 4, Al Quoz, Dubai',
  pickup_contact_name: 'Store Team',
  pickup_contact_phone: '0501112222',
};

const dropoffRow = {
  dropoff_address: 'JBR Walk, Dubai',
  dropoff_contact_name: 'Sara',
  dropoff_contact_phone: '0507654321',
  package_description: 'Shoes',
};

describe('customer bulk lists', () => {
  it('fills blank pickup columns from the list default but keeps a row-level pickup', () => {
    const [defaulted, custom] = applyPickupDefaults(
      [dropoffRow, { ...dropoffRow, pickup_address: 'Mall of the Emirates', pickup_contact_name: '', pickup_contact_phone: '' }],
      DEFAULT_PICKUP,
    );
    expect(defaulted).toMatchObject(DEFAULT_PICKUP);
    expect(custom).toMatchObject({ ...DEFAULT_PICKUP, pickup_address: 'Mall of the Emirates' });

    const results = validateBulkRecords([defaulted, custom]);
    expect(results.every((r) => r.error === null)).toBe(true);
  });

  it('rows still fail when there is no default pickup to fall back on', () => {
    const [row] = applyPickupDefaults([dropoffRow], { pickup_address: '', pickup_contact_name: '', pickup_contact_phone: '' });
    expect(validateBulkRecords([row])[0].error).toBe('pickup_address is required');
  });

  it('sanitizes untrusted JSON rows down to known string columns', () => {
    expect(sanitizeBulkRecords('nope')).toBeNull();
    const [row] = sanitizeBulkRecords([{ ...dropoffRow, quantity: 3, price: '0.01', evil: { $ne: 1 } }])!;
    expect(row.quantity).toBe('3');
    expect(row).not.toHaveProperty('price');
    expect(row).not.toHaveProperty('evil');
    expect(row.pickup_address).toBe('');
    expect(sanitizeBulkRecords([{ package_description: 'x'.repeat(2000) }])![0].package_description).toHaveLength(500);
  });

  it('only requires delivery columns in an imported CSV', () => {
    expect(missingCustomerBulkColumns(Object.keys(dropoffRow))).toEqual([]);
    expect(missingCustomerBulkColumns(['dropoff_address'])).toEqual([
      'dropoff_contact_name',
      'dropoff_contact_phone',
      'package_description',
    ]);
  });

  it('rejects a pickup date in the past', () => {
    const base = { name: 'Restock', notes: '', businessAccountId: null, clientRequestId: crypto.randomUUID() };
    expect(bulkBatchDetailsSchema.safeParse({ ...base, pickupDate: todayInUae() }).success).toBe(true);
    const past = bulkBatchDetailsSchema.safeParse({ ...base, pickupDate: '2020-01-01' });
    expect(past.success).toBe(false);
    expect(past.error?.issues[0]?.message).toBe('Pickup date cannot be in the past');
  });
});
