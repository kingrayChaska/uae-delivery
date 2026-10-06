import { describe, expect, it } from 'vitest';

import { parseShipmentCategory } from '@/lib/shipment/categories';

describe('parseShipmentCategory', () => {
  it.each(['all', 'individual', 'merchant', 'bulk'] as const)('accepts %s', (category) => {
    expect(parseShipmentCategory(category)).toBe(category);
  });

  it('falls back to all for anything else', () => {
    expect(parseShipmentCategory(undefined)).toBe('all');
    expect(parseShipmentCategory('')).toBe('all');
    expect(parseShipmentCategory('BULK')).toBe('all');
    expect(parseShipmentCategory("bulk' or 1=1")).toBe('all');
  });

  it('uses the first value of a repeated parameter', () => {
    expect(parseShipmentCategory(['merchant', 'bulk'])).toBe('merchant');
  });
});
