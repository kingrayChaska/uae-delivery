import { describe, expect, it } from 'vitest';

import { ACTIVE_STATUSES, DRIVER_STATUS_FILTERS, NO_FILTERS, hasFilters, parseShipmentFilters, shipmentListHref, statusesFor } from '@/lib/shipment/filters';
import { SHIPMENT_STATUSES } from '@/lib/types';

// The matching itself happens in Postgres (search_customer_shipments,
// migration 0032; checked by database/test/customer-search.sql). These
// cover what the app sends it and the URLs the cards and pages build.

const BASE = '/dashboard/customer/deliveries';

describe('parseShipmentFilters', () => {
  it('reads every filter from the URL', () => {
    expect(parseShipmentFilters({ q: ' Ahmed ', status: 'delivered', from: '2026-10-01', to: '2026-10-06' })).toEqual({
      scope: 'mine',
      q: 'Ahmed',
      status: 'delivered',
      from: '2026-10-01',
      to: '2026-10-06',
    });
  });

  it('means no filters when the URL has none', () => {
    expect(parseShipmentFilters({})).toEqual(NO_FILTERS);
    expect(hasFilters(parseShipmentFilters({}))).toBe(false);
  });

  it.each(SHIPMENT_STATUSES)('accepts the real status %s', (status) => {
    expect(parseShipmentFilters({ status }).status).toBe(status);
  });

  it('accepts the Active group and All', () => {
    expect(parseShipmentFilters({ status: 'active' }).status).toBe('active');
    expect(parseShipmentFilters({ status: 'all' }).status).toBe('all');
  });

  it('ignores statuses that do not exist, and anything else malformed', () => {
    expect(parseShipmentFilters({ status: 'pending' }).status).toBe('all');
    expect(parseShipmentFilters({ status: "delivered' or 1=1" }).status).toBe('all');
    expect(parseShipmentFilters({ from: '2026-02-31', to: 'yesterday' })).toMatchObject({ from: null, to: null });
    expect(parseShipmentFilters({ from: '06/10/2026' }).from).toBeNull();
  });

  it('allows an open-ended range', () => {
    expect(parseShipmentFilters({ from: '2026-10-01' })).toMatchObject({ from: '2026-10-01', to: null });
    expect(parseShipmentFilters({ to: '2026-10-06' })).toMatchObject({ from: null, to: '2026-10-06' });
  });

  it('reads a backwards range as the days between', () => {
    expect(parseShipmentFilters({ from: '2026-10-06', to: '2026-10-01' })).toMatchObject({ from: '2026-10-01', to: '2026-10-06' });
  });

  it('caps and tidies the search text', () => {
    expect(parseShipmentFilters({ q: '  050   123  ' }).q).toBe('050 123');
    expect(parseShipmentFilters({ q: 'x'.repeat(500) }).q).toHaveLength(100);
  });

  it('takes the first of repeated parameters', () => {
    expect(parseShipmentFilters({ status: ['returned', 'delivered'] }).status).toBe('returned');
  });
});

describe('scope', () => {
  it("is the customer's own list unless the URL asks for the business", () => {
    expect(parseShipmentFilters({}).scope).toBe('mine');
    expect(parseShipmentFilters({ scope: 'business' }).scope).toBe('business');
    expect(parseShipmentFilters({ scope: 'everyone' }).scope).toBe('mine');
  });

  it('is not a narrowing filter (no "Clear filters", no "N match")', () => {
    expect(hasFilters(parseShipmentFilters({ scope: 'business' }))).toBe(false);
  });

  it("links the merchant page's Shipments card to the business list, and keeps it across pages", () => {
    expect(shipmentListHref(BASE, { scope: 'business' })).toBe(`${BASE}?scope=business`);
    expect(shipmentListHref(BASE, { scope: 'business', status: 'delivered' }, 2)).toBe(`${BASE}?scope=business&status=delivered&page=2`);
    expect(shipmentListHref(BASE, { scope: 'mine' })).toBe(BASE);
  });
});

describe('statusesFor', () => {
  it('sends no status condition for All', () => {
    expect(statusesFor('all')).toBeNull();
  });

  it('sends exactly the statuses the Active card counts', () => {
    expect(statusesFor('active')).toEqual([...ACTIVE_STATUSES]);
    expect(statusesFor('active')).not.toContain('pending_payment');
    expect(statusesFor('active')).not.toContain('delivered');
  });

  it('sends one status for a single-status filter', () => {
    expect(statusesFor('cancelled')).toEqual(['cancelled']);
  });
});

describe('shipmentListHref', () => {
  it('is the bare list for no filters (the Total / All card)', () => {
    expect(shipmentListHref(BASE)).toBe(BASE);
    expect(shipmentListHref(BASE, NO_FILTERS)).toBe(BASE);
  });

  it('links each dashboard card to its status', () => {
    expect(shipmentListHref(BASE, { status: 'active' })).toBe(`${BASE}?status=active`);
    expect(shipmentListHref(BASE, { status: 'pending_payment' })).toBe(`${BASE}?status=pending_payment`);
    expect(shipmentListHref(BASE, { status: 'delivered' })).toBe(`${BASE}?status=delivered`);
  });

  it('round-trips through the URL (refresh keeps the filters)', () => {
    const filters = { scope: 'business' as const, q: 'Ahmed & Sons', status: 'delivered' as const, from: '2026-10-01', to: '2026-10-06' };
    const href = shipmentListHref(BASE, filters);
    const params = Object.fromEntries(new URL(href, 'https://example.com').searchParams);
    expect(parseShipmentFilters(params)).toEqual(filters);
  });

  it('keeps the filters on later pages, and leaves page 1 out', () => {
    expect(shipmentListHref(BASE, { status: 'delivered' }, 3)).toBe(`${BASE}?status=delivered&page=3`);
    expect(shipmentListHref(BASE, { status: 'delivered' }, 1)).toBe(`${BASE}?status=delivered`);
  });
});

describe('driver list', () => {
  const DRIVER = '/dashboard/driver/deliveries';

  it('offers only statuses an assigned shipment can be in', () => {
    expect(DRIVER_STATUS_FILTERS).not.toContain('pending_payment');
    expect(DRIVER_STATUS_FILTERS).not.toContain('confirmed');
    expect(parseShipmentFilters({ status: 'pending_payment' }, DRIVER_STATUS_FILTERS).status).toBe('all');
    expect(parseShipmentFilters({ status: 'in_transit' }, DRIVER_STATUS_FILTERS).status).toBe('in_transit');
    expect(parseShipmentFilters({ status: 'active' }, DRIVER_STATUS_FILTERS).status).toBe('active');
  });

  it('reads search, a single day and status together', () => {
    expect(parseShipmentFilters({ q: ' PL-1024 ', from: '2026-10-08', to: '2026-10-08', status: 'delivered' }, DRIVER_STATUS_FILTERS)).toEqual({
      scope: 'mine',
      q: 'PL-1024',
      status: 'delivered',
      from: '2026-10-08',
      to: '2026-10-08',
    });
  });

  it('treats a blank search as no search', () => {
    expect(hasFilters(parseShipmentFilters({ q: '   ' }, DRIVER_STATUS_FILTERS))).toBe(false);
  });

  it('round-trips through the URL with a page, and a new search starts at page 1', () => {
    const filters = { scope: 'mine' as const, q: 'Ahmed', status: 'all' as const, from: '2026-10-08', to: '2026-10-08' };
    const href = shipmentListHref(DRIVER, filters, 2);
    expect(href).toBe(`${DRIVER}?q=Ahmed&from=2026-10-08&to=2026-10-08&page=2`);
    const params = Object.fromEntries(new URL(href, 'https://example.com').searchParams);
    expect(parseShipmentFilters(params, DRIVER_STATUS_FILTERS)).toEqual(filters);
    expect(shipmentListHref(DRIVER, { ...filters, q: 'Dubai Marina' })).not.toContain('page=');
  });
});
