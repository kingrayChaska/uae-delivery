import { describe, expect, it } from 'vitest';

import { CUSTOMER_SEARCH_MAX_LENGTH, normalizeCustomerSearch } from '@/lib/customers/search';

describe('normalizeCustomerSearch', () => {
  it('treats a missing or blank search as no search', () => {
    expect(normalizeCustomerSearch(undefined)).toBeNull();
    expect(normalizeCustomerSearch(null)).toBeNull();
    expect(normalizeCustomerSearch('')).toBeNull();
    expect(normalizeCustomerSearch('   ')).toBeNull();
  });

  it('trims and collapses whitespace, keeping case and wildcards for the database to match literally', () => {
    expect(normalizeCustomerSearch('  Acme   Trading ')).toBe('Acme Trading');
    expect(normalizeCustomerSearch('50%_off')).toBe('50%_off');
    expect(normalizeCustomerSearch('مؤسسة النور')).toBe('مؤسسة النور');
  });

  it('caps the length', () => {
    expect(normalizeCustomerSearch('a'.repeat(500))).toHaveLength(CUSTOMER_SEARCH_MAX_LENGTH);
  });

  it('uses the first value of a repeated parameter', () => {
    expect(normalizeCustomerSearch(['omar', 'zed'])).toBe('omar');
  });
});
