import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';

import type { Paginated } from '@/lib/pagination';
import type { CashFilters, DriverLedgerFilters, RemittanceMethod, RemittanceStatus } from '@/lib/cash/schemas';
import type { CodStatus, ShipmentStatus } from '@/lib/types';

// Driver cash reconciliation (migration 0042). Every total is computed in
// the database (driver_cash_summary / driver_cash_totals) from the
// cod_transactions and driver_cash_remittances rows — never summed here
// from a page of rows, and never taken from the browser.

const money = (value: number | string | null) => Number(value ?? 0);

export type DriverCashRow = {
  driverId: string;
  driverName: string;
  driverPhone: string;
  // Cash shipments assigned to the driver (in the period, when one is chosen).
  shipments: number;
  // Still to collect, on shipments not yet delivered. Not money held.
  expected: number;
  // Confirmed collections (verified amounts), all time and in the period.
  collected: number;
  collectedInPeriod: number;
  // Collected before amounts were recorded (migration 0042) and not yet
  // settled. Shown apart: never counted in the balance.
  unverified: number;
  // Confirmed remittances, all time and in the period.
  remitted: number;
  remittedInPeriod: number;
  // Recorded but awaiting a manager: not deducted.
  pending: number;
  // collected − remitted, as of now.
  outstanding: number;
  lastRemittanceOn: string | null;
};

export type DriverCashTotals = Omit<DriverCashRow, 'driverId' | 'driverName' | 'driverPhone' | 'shipments' | 'lastRemittanceOn'> & {
  drivers: number;
};

type SummaryRow = {
  driver_id: string;
  driver_name: string;
  driver_phone: string;
  shipments: number | string;
  expected: number | string;
  collected: number | string;
  collected_in_period: number | string;
  unverified: number | string;
  remitted: number | string;
  remitted_in_period: number | string;
  pending: number | string;
  outstanding: number | string;
  last_remittance_on: string | null;
};

const toRow = (row: SummaryRow): DriverCashRow => ({
  driverId: row.driver_id,
  driverName: row.driver_name,
  driverPhone: row.driver_phone,
  shipments: Number(row.shipments),
  expected: money(row.expected),
  collected: money(row.collected),
  collectedInPeriod: money(row.collected_in_period),
  unverified: money(row.unverified),
  remitted: money(row.remitted),
  remittedInPeriod: money(row.remitted_in_period),
  pending: money(row.pending),
  outstanding: money(row.outstanding),
  lastRemittanceOn: row.last_remittance_on,
});

const summaryParams = (filters: CashFilters) => ({
  p_from: filters.from,
  p_to: filters.to,
  p_query: filters.q || null,
});

// One page of drivers, largest balance first. Throws when it can't be read,
// so the page can say so instead of showing zeros.
export const listDriverCash = async (page: number, filters: CashFilters): Promise<Paginated<DriverCashRow>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);
  const { data, count, error } = await supabase
    .rpc('driver_cash_summary', summaryParams(filters), { count: 'exact' })
    .range(from, to);
  if (error) throw new Error(error.message);
  return toPaginated(((data ?? []) as SummaryRow[]).map(toRow), count ?? 0, page);
};

// The summary cards: the same filters, over every matching driver.
export const getDriverCashTotals = async (filters: CashFilters): Promise<DriverCashTotals> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('driver_cash_totals', summaryParams(filters)).single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, number | string>;
  return {
    drivers: Number(row.drivers ?? 0),
    expected: money(row.expected),
    collected: money(row.collected),
    collectedInPeriod: money(row.collected_in_period),
    unverified: money(row.unverified),
    remitted: money(row.remitted),
    remittedInPeriod: money(row.remitted_in_period),
    pending: money(row.pending),
    outstanding: money(row.outstanding),
  };
};

// One driver's position (with the period columns for the chosen range);
// null when they have no cash records yet (or aren't a driver).
export const getDriverCashPosition = async (
  driverId: string,
  filters: Pick<CashFilters, 'from' | 'to'>,
): Promise<DriverCashRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('driver_cash_summary', { p_from: filters.from, p_to: filters.to, p_query: null })
    .eq('driver_id', driverId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRow(data as SummaryRow) : null;
};

export type DriverIdentity = { id: string; fullName: string; phone: string };

export const getDriverIdentity = async (driverId: string): Promise<DriverIdentity | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role')
    .eq('id', driverId)
    .maybeSingle();
  if (!data || data.role !== 'driver') return null;
  return { id: data.id, fullName: data.full_name, phone: data.phone };
};

// ── Ledger rows ──────────────────────────────────────────────────────────
export type CollectionRecord = {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  shipmentStatus: ShipmentStatus | null;
  // The goods amount from the recipient, and the sender's cash delivery fee.
  productAmount: number;
  deliveryFeeAmount: number;
  // What the driver is responsible for on this shipment.
  expectedAmount: number;
  // Recorded at collection; null = not collected, or collected before
  // amounts were recorded (verified === false).
  collectedAmount: number | null;
  verified: boolean;
  status: CodStatus;
  collectedAt: string | null;
  remittanceId: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

type CollectionRow = {
  id: string;
  shipment_id: string;
  amount: number | string;
  product_amount: number | string;
  delivery_fee_amount: number | string;
  collected_amount: number | string | null;
  status: CodStatus;
  collected_at: string | null;
  remittance_id: string | null;
  created_at: string;
  updated_at: string;
  shipment: { tracking_number: string; status: ShipmentStatus; currency: string } | { tracking_number: string; status: ShipmentStatus; currency: string }[] | null;
};

const LEDGER_PAGE_SIZE = 25;

// Day bounds in UAE time, as the database's period filters use.
const uaeStart = (date: string) => `${date}T00:00:00+04:00`;
const uaeEndExclusive = (date: string) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString().slice(0, 10)}T00:00:00+04:00`;
};

// Tracking codes are letters and digits (legacy ones add dashes); anything
// else can't match and must never reach a PostgREST filter string.
const trackingQuery = (q: string) => {
  const code = q.toUpperCase().replace(/\s/g, '');
  return /^[A-Z0-9-]{1,40}$/.test(code) ? code : null;
};

export const listDriverCollections = async (
  driverId: string,
  filters: DriverLedgerFilters,
  page: number,
): Promise<Paginated<CollectionRecord>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page, LEDGER_PAGE_SIZE);

  let query = supabase
    .from('cod_transactions')
    .select(
      'id, shipment_id, amount, product_amount, delivery_fee_amount, collected_amount, status, collected_at, remittance_id, created_at, updated_at, shipment:shipments!inner(tracking_number, status, currency)',
      { count: 'exact' },
    )
    .eq('driver_id', driverId);

  if (filters.collection === 'unverified') {
    query = query.eq('status', 'collected').is('collected_amount', null);
  } else if (filters.collection !== 'all') {
    query = query.eq('status', filters.collection);
  }
  if (filters.q) {
    const code = trackingQuery(filters.q);
    if (!code) return toPaginated([], 0, page, LEDGER_PAGE_SIZE);
    query = query.ilike('shipment.tracking_number', `%${code}%`);
  }
  // The date of the collection, or of the assignment while not collected.
  if (filters.from || filters.to) {
    const bounds = (column: string) =>
      [
        filters.from ? `${column}.gte.${uaeStart(filters.from)}` : null,
        filters.to ? `${column}.lt.${uaeEndExclusive(filters.to)}` : null,
      ].filter(Boolean);
    query = query.or(
      `and(${bounds('collected_at').join(',')}),and(collected_at.is.null,${bounds('created_at').join(',')})`,
    );
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);

  const items = ((data ?? []) as CollectionRow[]).map((row): CollectionRecord => {
    const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;
    return {
      id: row.id,
      shipmentId: row.shipment_id,
      trackingNumber: shipment?.tracking_number ?? '—',
      shipmentStatus: shipment?.status ?? null,
      productAmount: money(row.product_amount),
      deliveryFeeAmount: money(row.delivery_fee_amount),
      expectedAmount: money(row.amount),
      collectedAmount: row.collected_amount === null ? null : money(row.collected_amount),
      verified: row.collected_amount !== null,
      status: row.status,
      collectedAt: row.collected_at,
      remittanceId: row.remittance_id,
      currency: shipment?.currency ?? 'AED',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
  return toPaginated(items, count ?? 0, page, LEDGER_PAGE_SIZE);
};

export type RemittanceRecord = {
  id: string;
  amount: number;
  currency: string;
  method: RemittanceMethod;
  reference: string | null;
  notes: string | null;
  receivedOn: string;
  status: RemittanceStatus;
  recordedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
};

type RemittanceRow = {
  id: string;
  amount: number | string;
  currency: string;
  method: RemittanceMethod;
  reference: string | null;
  notes: string | null;
  received_on: string;
  status: RemittanceStatus;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  recorder: { full_name: string } | { full_name: string }[] | null;
  decider: { full_name: string } | { full_name: string }[] | null;
};

const nameOf = (embed: RemittanceRow['recorder']) => (Array.isArray(embed) ? embed[0]?.full_name : embed?.full_name) ?? null;

export const listDriverRemittances = async (
  driverId: string,
  filters: Pick<DriverLedgerFilters, 'from' | 'to' | 'remittance' | 'q'>,
  page: number,
): Promise<Paginated<RemittanceRecord>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page, LEDGER_PAGE_SIZE);

  let query = supabase
    .from('driver_cash_remittances')
    .select(
      'id, amount, currency, method, reference, notes, received_on, status, decided_at, decision_note, created_at, recorder:profiles!driver_cash_remittances_recorded_by_fkey(full_name), decider:profiles!driver_cash_remittances_decided_by_fkey(full_name)',
      { count: 'exact' },
    )
    .eq('driver_id', driverId);
  if (filters.remittance !== 'all') query = query.eq('status', filters.remittance);
  if (filters.from) query = query.gte('received_on', filters.from);
  if (filters.to) query = query.lte('received_on', filters.to);

  const { data, count, error } = await query
    .order('received_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);

  const items = ((data ?? []) as RemittanceRow[]).map(
    (row): RemittanceRecord => ({
      id: row.id,
      amount: money(row.amount),
      currency: row.currency,
      method: row.method,
      reference: row.reference,
      notes: row.notes,
      receivedOn: row.received_on,
      status: row.status,
      recordedBy: nameOf(row.recorder) ?? '—',
      decidedBy: nameOf(row.decider),
      decidedAt: row.decided_at,
      decisionNote: row.decision_note,
      createdAt: row.created_at,
    }),
  );
  return toPaginated(items, count ?? 0, page, LEDGER_PAGE_SIZE);
};

// Remittances waiting for a manager, across every driver (the manager's queue).
export const countPendingRemittances = async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from('driver_cash_remittances')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
};

export { LEDGER_PAGE_SIZE };
