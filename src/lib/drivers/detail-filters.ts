import { SHIPMENT_STATUSES } from '@/lib/types';

import type { ShipmentStatus } from '@/lib/types';

// One driver's page on the operator dashboard (/dashboard/operator/drivers/
// [id]): search, status filter and reporting period, read from and written
// to the URL (?q=&status=&period=&from=&to=&page=) like the other shipment
// lists. The database does the matching and counting (migration 0049); this
// only names the groups and works out the dates.

// The filters, each a group of stored statuses. Every status is in exactly
// one group, so the groups' counts add up to the total.
export const DRIVER_DETAIL_FILTERS = ['all', 'pending', 'in_transit', 'delivered', 'delivery_failed', 'cancelled', 'returned'] as const;
export type DriverDetailFilter = (typeof DRIVER_DETAIL_FILTERS)[number];

export const DRIVER_FILTER_STATUSES: Record<Exclude<DriverDetailFilter, 'all'>, readonly ShipmentStatus[]> = {
  // Not picked up yet: waiting for the driver to accept, or on the way to
  // the sender. (pending_payment / confirmed don't normally carry a driver;
  // listed so no status is ever left out.)
  pending: ['pending_payment', 'confirmed', 'assigned', 'driver_accepted', 'arrived_pickup'],
  // On board: picked up and not yet handed over.
  in_transit: ['picked_up', 'in_transit', 'arrived_destination'],
  delivered: ['delivered'],
  delivery_failed: ['delivery_failed'],
  cancelled: ['cancelled'],
  returned: ['returned'],
};

export const statusesForDriverFilter = (filter: DriverDetailFilter): ShipmentStatus[] | null =>
  filter === 'all' ? null : [...DRIVER_FILTER_STATUSES[filter]];

export type StatusCounts = Partial<Record<ShipmentStatus, number>>;

export const countForDriverFilter = (counts: StatusCounts, filter: DriverDetailFilter): number => {
  const statuses: readonly ShipmentStatus[] = statusesForDriverFilter(filter) ?? SHIPMENT_STATUSES;
  return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
};

// Reporting periods. Weeks run Monday–Sunday in UAE time, as the cash
// remittance weeks do (migration 0048).
export const DRIVER_PERIODS = ['all', 'this_week', 'last_week', 'this_month', 'custom'] as const;
export type DriverPeriod = (typeof DRIVER_PERIODS)[number];

export type DriverDetailState = {
  q: string;
  status: DriverDetailFilter;
  period: DriverPeriod;
  // Only for 'custom' (YYYY-MM-DD, UAE); either end may be open.
  from: string | null;
  to: string | null;
};

export const DEFAULT_DRIVER_DETAIL: DriverDetailState = { q: '', status: 'all', period: 'all', from: null, to: null };

export const MAX_DRIVER_QUERY_LENGTH = 100;

type RawParam = string | string[] | undefined;
const first = (value: RawParam) => (Array.isArray(value) ? value[0] : value);

const isDate = (raw: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(raw);
};
const parseDate = (value: RawParam): string | null => {
  const raw = first(value)?.trim();
  return raw && isDate(raw) ? raw : null;
};

// Anything unrecognised falls back to the default. A custom period needs at
// least one date; without one it's all time.
export const parseDriverDetailParams = (params: {
  q?: RawParam;
  status?: RawParam;
  period?: RawParam;
  from?: RawParam;
  to?: RawParam;
}): DriverDetailState => {
  const q = (first(params.q) ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_DRIVER_QUERY_LENGTH);
  const status = DRIVER_DETAIL_FILTERS.find((s) => s === first(params.status)) ?? 'all';
  let period = DRIVER_PERIODS.find((p) => p === first(params.period)) ?? 'all';
  let from = period === 'custom' ? parseDate(params.from) : null;
  let to = period === 'custom' ? parseDate(params.to) : null;
  if (period === 'custom' && !from && !to) period = 'all';
  // A range typed backwards still means the days between them.
  if (from && to && from > to) [from, to] = [to, from];
  return { q, status, period, from, to };
};

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// The dates a period covers, inclusive, given today's UAE date. null = open.
export const resolveDriverPeriod = (
  state: Pick<DriverDetailState, 'period' | 'from' | 'to'>,
  today: string,
): { from: string | null; to: string | null } => {
  // getUTCDay(): 0 = Sunday … 6 = Saturday; Monday starts the week.
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = shift(today, -((weekday + 6) % 7));
  switch (state.period) {
    case 'this_week':
      return { from: monday, to: shift(monday, 6) };
    case 'last_week':
      return { from: shift(monday, -7), to: shift(monday, -1) };
    case 'this_month': {
      const start = `${today.slice(0, 7)}-01`;
      const next = new Date(`${start}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return { from: start, to: shift(next.toISOString().slice(0, 10), -1) };
    }
    case 'custom':
      return { from: state.from, to: state.to };
    default:
      return { from: null, to: null };
  }
};

export const hasDriverFilters = (state: DriverDetailState) => state.q !== '' || state.status !== 'all';

// The page's URL for this state (and page), defaults left out.
export const driverDetailHref = (basePath: string, state: Partial<DriverDetailState> = {}, page = 1) => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.status && state.status !== 'all') params.set('status', state.status);
  if (state.period && state.period !== 'all') params.set('period', state.period);
  if (state.period === 'custom') {
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
};
