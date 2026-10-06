import { SHIPMENT_STATUSES } from '@/lib/types';

import type { ShipmentStatus } from '@/lib/types';

// The customer Deliveries list's filters, read from and written to the URL
// (?scope=&q=&status=&from=&to=) so a filtered view survives a refresh, can be
// shared, and is what the dashboard cards link to. The database does the
// filtering (search_customer_shipments, migration 0032).

// Booked and on its way: everything between payment and the end of the
// trip. The dashboard's "Active" card counts exactly these.
export const ACTIVE_STATUSES = [
  'confirmed',
  'assigned',
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
] as const satisfies readonly ShipmentStatus[];

// 'all', the 'active' group, or one shipment status.
export const STATUS_FILTERS = ['all', 'active', ...SHIPMENT_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

// Whose shipments: the customer's own bookings, or (merchants in a
// business account) every shipment of that account — what the merchant
// page's Shipments card counts.
export const SHIPMENT_SCOPES = ['mine', 'business'] as const;
export type ShipmentScope = (typeof SHIPMENT_SCOPES)[number];

export type ShipmentFilters = {
  scope: ShipmentScope;
  // Name or phone (one search box).
  q: string;
  status: StatusFilter;
  // Booking date, YYYY-MM-DD in UAE time; either end may be open.
  from: string | null;
  to: string | null;
};

export const NO_FILTERS: ShipmentFilters = { scope: 'mine', q: '', status: 'all', from: null, to: null };

export const MAX_QUERY_LENGTH = 100;

type RawParam = string | string[] | undefined;
const first = (value: RawParam) => (Array.isArray(value) ? value[0] : value);

// A real calendar date, so ?from=2026-02-31 is ignored rather than sent on.
const parseDate = (value: RawParam): string | null => {
  const raw = first(value)?.trim();
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(raw) ? raw : null;
};

// Anything unrecognised falls back to no filter, like ?page= does.
export const parseShipmentFilters = (params: {
  scope?: RawParam;
  q?: RawParam;
  status?: RawParam;
  from?: RawParam;
  to?: RawParam;
}): ShipmentFilters => {
  // Whether the caller may use 'business' is the page's decision.
  const scope = first(params.scope) === 'business' ? 'business' : 'mine';
  const q = (first(params.q) ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
  const status = STATUS_FILTERS.find((s) => s === first(params.status)) ?? 'all';
  let from = parseDate(params.from);
  let to = parseDate(params.to);
  // A range typed backwards still means the days between them.
  if (from && to && from > to) [from, to] = [to, from];
  return { scope, q, status, from, to };
};

// Narrowing filters only: the scope picks whose list it is.
export const hasFilters = (filters: ShipmentFilters) =>
  filters.q !== '' || filters.status !== 'all' || filters.from !== null || filters.to !== null;

// The statuses a filter matches; null for all of them.
export const statusesFor = (status: StatusFilter): ShipmentStatus[] | null => {
  if (status === 'all') return null;
  if (status === 'active') return [...ACTIVE_STATUSES];
  return [status];
};

// The list's URL for these filters (and page), with defaults left out so
// the unfiltered list is just the bare path.
export const shipmentListHref = (basePath: string, filters: Partial<ShipmentFilters> = {}, page = 1) => {
  const params = new URLSearchParams();
  if (filters.scope === 'business') params.set('scope', 'business');
  if (filters.q) params.set('q', filters.q);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
};
