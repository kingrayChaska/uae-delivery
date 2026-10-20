import { describe, expect, it } from 'vitest';

import { SHIPMENT_STATUSES } from '@/lib/types';
import {
  DRIVER_DETAIL_FILTERS,
  DRIVER_FILTER_STATUSES,
  countForDriverFilter,
  driverDetailHref,
  parseDriverDetailParams,
  resolveDriverPeriod,
  statusesForDriverFilter,
} from '@/lib/drivers/detail-filters';

describe('driver detail status filters', () => {
  it('puts every stored status in exactly one group', () => {
    const grouped = Object.values(DRIVER_FILTER_STATUSES).flat();
    expect([...grouped].sort()).toEqual([...SHIPMENT_STATUSES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('maps labels to stored statuses', () => {
    expect(statusesForDriverFilter('all')).toBeNull();
    expect(statusesForDriverFilter('in_transit')).toEqual(['picked_up', 'in_transit', 'arrived_destination']);
    expect(statusesForDriverFilter('delivered')).toEqual(['delivered']);
  });

  it('counts a group from per-status counts, and the groups add up to all', () => {
    const counts = { assigned: 2, driver_accepted: 1, in_transit: 3, delivered: 5, cancelled: 1, returned: 1, delivery_failed: 2 };
    expect(countForDriverFilter(counts, 'pending')).toBe(3);
    expect(countForDriverFilter(counts, 'in_transit')).toBe(3);
    const groups = DRIVER_DETAIL_FILTERS.filter((f) => f !== 'all').reduce((sum, f) => sum + countForDriverFilter(counts, f), 0);
    expect(groups).toBe(countForDriverFilter(counts, 'all'));
    expect(countForDriverFilter(counts, 'all')).toBe(15);
  });
});

describe('parseDriverDetailParams', () => {
  it('falls back to defaults for anything unrecognised', () => {
    expect(parseDriverDetailParams({ status: 'paid', period: 'forever', q: '  a   b ' })).toEqual({
      q: 'a b',
      status: 'all',
      period: 'all',
      from: null,
      to: null,
    });
  });

  it('keeps dates only for a custom period, swaps a backwards range, and needs one date', () => {
    expect(parseDriverDetailParams({ period: 'this_week', from: '2026-01-01' }).from).toBeNull();
    expect(parseDriverDetailParams({ period: 'custom', from: '2026-03-10', to: '2026-03-01' })).toMatchObject({
      period: 'custom',
      from: '2026-03-01',
      to: '2026-03-10',
    });
    expect(parseDriverDetailParams({ period: 'custom', from: '2026-02-31' }).period).toBe('all');
  });

  it('caps the query length', () => {
    expect(parseDriverDetailParams({ q: 'x'.repeat(300) }).q).toHaveLength(100);
  });
});

describe('resolveDriverPeriod', () => {
  // 2026-10-21 is a Wednesday.
  const today = '2026-10-21';

  it('weeks run Monday to Sunday', () => {
    expect(resolveDriverPeriod({ period: 'this_week', from: null, to: null }, today)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(resolveDriverPeriod({ period: 'last_week', from: null, to: null }, today)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    // A Sunday belongs to the week that started six days earlier.
    expect(resolveDriverPeriod({ period: 'this_week', from: null, to: null }, '2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    // A Monday starts its own week.
    expect(resolveDriverPeriod({ period: 'this_week', from: null, to: null }, '2026-10-19').from).toBe('2026-10-19');
  });

  it('a month is its calendar month, across year ends and short months', () => {
    expect(resolveDriverPeriod({ period: 'this_month', from: null, to: null }, today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolveDriverPeriod({ period: 'this_month', from: null, to: null }, '2026-12-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(resolveDriverPeriod({ period: 'this_month', from: null, to: null }, '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('all time is open; custom is as given', () => {
    expect(resolveDriverPeriod({ period: 'all', from: null, to: null }, today)).toEqual({ from: null, to: null });
    expect(resolveDriverPeriod({ period: 'custom', from: '2026-01-01', to: null }, today)).toEqual({ from: '2026-01-01', to: null });
  });
});

describe('driverDetailHref', () => {
  const base = '/dashboard/operator/drivers/abc';

  it('leaves defaults out', () => {
    expect(driverDetailHref(base)).toBe(base);
    expect(driverDetailHref(base, { status: 'all', period: 'all', q: '' })).toBe(base);
  });

  it('keeps search, filter and period together, dates only when custom', () => {
    expect(driverDetailHref(base, { q: 'rana', status: 'delivered', period: 'this_week', from: '2026-01-01' }, 2)).toBe(
      `${base}?q=rana&status=delivered&period=this_week&page=2`,
    );
    expect(driverDetailHref(base, { period: 'custom', from: '2026-01-01', to: '2026-01-31' })).toBe(
      `${base}?period=custom&from=2026-01-01&to=2026-01-31`,
    );
  });
});
