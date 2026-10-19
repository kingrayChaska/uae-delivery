import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';

import type { Paginated } from '@/lib/pagination';
import type { RemittanceView } from '@/lib/cash/remittances';

// Weekly cash remittance (migration 0048). Every figure comes from the
// database's own functions — never summed here, never from the browser —
// and each function decides who may see it (a driver their own, an operator
// their own, a manager every operator's).

const money = (value: unknown) => Number(value ?? 0);
const HISTORY_PAGE_SIZE = 25;
const statusParam = (view: RemittanceView) => (view === 'all' ? null : view);

export type DriverCashOverview = {
  weekStart: string;
  weekEnd: string;
  week: { collectedCod: number; collectedFee: number; confirmed: number };
  openingOutstanding: number;
  collectedCod: number;
  collectedFee: number;
  confirmedCod: number;
  confirmedFee: number;
  // Confirmed by staff before submissions carried a COD/fee split (0042).
  confirmedUnclassified: number;
  pendingCod: number;
  pendingFee: number;
  pendingUnclassified: number;
  pendingCount: number;
  disputedCount: number;
  disputedAmount: number;
  outstanding: number;
  outstandingCod: number;
  outstandingFee: number;
  available: number;
  availableCod: number;
  availableFee: number;
  expected: number;
  unverified: number;
};

const toDriverOverview = (row: Record<string, unknown>): DriverCashOverview => {
  const week = (row.week ?? {}) as Record<string, unknown>;
  return {
    weekStart: String(row.weekStart),
    weekEnd: String(row.weekEnd),
    week: { collectedCod: money(week.collectedCod), collectedFee: money(week.collectedFee), confirmed: money(week.confirmed) },
    openingOutstanding: money(row.openingOutstanding),
    collectedCod: money(row.collectedCod),
    collectedFee: money(row.collectedFee),
    confirmedCod: money(row.confirmedCod),
    confirmedFee: money(row.confirmedFee),
    confirmedUnclassified: money(row.confirmedUnclassified),
    pendingCod: money(row.pendingCod),
    pendingFee: money(row.pendingFee),
    pendingUnclassified: money(row.pendingUnclassified),
    pendingCount: Number(row.pendingCount ?? 0),
    disputedCount: Number(row.disputedCount ?? 0),
    disputedAmount: money(row.disputedAmount),
    outstanding: money(row.outstanding),
    outstandingCod: money(row.outstandingCod),
    outstandingFee: money(row.outstandingFee),
    available: money(row.available),
    availableCod: money(row.availableCod),
    availableFee: money(row.availableFee),
    expected: money(row.expected),
    unverified: money(row.unverified),
  };
};

// The signed-in driver's position (or a driver's, for staff). Throws when it
// can't be read, so the page says so instead of showing zeros.
export const getDriverCashOverview = async (driverId?: string): Promise<DriverCashOverview | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('driver_cash_overview', driverId ? { p_driver_id: driverId } : {});
  if (error) throw error;
  return data ? toDriverOverview(data as Record<string, unknown>) : null;
};

export type DriverCashWeek = {
  weekStart: string;
  opening: number;
  collectedCod: number;
  collectedFee: number;
  confirmed: number;
  closing: number;
};

export const listDriverCashWeeks = async (driverId?: string, weeks = 8): Promise<DriverCashWeek[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('driver_cash_weeks', { p_driver_id: driverId ?? null, p_weeks: weeks });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    weekStart: String(row.week_start),
    opening: money(row.opening),
    collectedCod: money(row.collected_cod),
    collectedFee: money(row.collected_fee),
    confirmed: money(row.confirmed),
    closing: money(row.closing),
  }));
};

export type RemittanceEntry = {
  id: string;
  number: string;
  // 'driver' = submitted by the driver; 'staff' = recorded by staff (0042).
  source: 'driver' | 'staff' | 'operator';
  periodStart: string;
  amount: number;
  codAmount: number | null;
  feeAmount: number | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'disputed';
  notes: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  // A counted-cash record: the disputed submission it belongs to.
  discrepancyOf: string | null;
  // A disputed submission: what was counted from it, if anything.
  countedAmount: number | null;
  // Who it's from (queue and manager views).
  fromName: string | null;
  fromPhone: string | null;
  fromId: string | null;
};

const toEntry = (row: Record<string, unknown>, source: RemittanceEntry['source']): RemittanceEntry => ({
  id: String(row.id),
  number: String(row.remittance_number),
  source: (row.source as RemittanceEntry['source'] | undefined) ?? source,
  periodStart: String(row.period_start),
  amount: money(row.amount),
  codAmount: row.cod_amount === null || row.cod_amount === undefined ? null : money(row.cod_amount),
  feeAmount: row.fee_amount === null || row.fee_amount === undefined ? null : money(row.fee_amount),
  status: row.status as RemittanceEntry['status'],
  notes: (row.notes as string | null) ?? null,
  decisionNote: (row.decision_note as string | null) ?? null,
  createdAt: String(row.created_at),
  decidedAt: (row.decided_at as string | null) ?? null,
  decidedBy: (row.decided_by_name as string | null) ?? null,
  discrepancyOf: (row.discrepancy_of_number as string | null) ?? null,
  countedAmount: row.counted_amount === null || row.counted_amount === undefined ? null : money(row.counted_amount),
  fromName: (row.driver_name as string | null) ?? (row.operator_name as string | null) ?? null,
  fromPhone: (row.driver_phone as string | null) ?? null,
  fromId: (row.driver_id as string | null) ?? (row.operator_id as string | null) ?? null,
});

const paged = async (
  fn: 'driver_remittance_history' | 'driver_remittance_queue' | 'operator_remittance_history',
  params: Record<string, unknown>,
  page: number,
  source: RemittanceEntry['source'],
): Promise<Paginated<RemittanceEntry>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page, HISTORY_PAGE_SIZE);
  const { data, count, error } = await supabase.rpc(fn, params, { count: 'exact' }).range(from, to);
  if (error) throw error;
  return toPaginated(
    ((data ?? []) as Record<string, unknown>[]).map((row) => toEntry(row, source)),
    count ?? 0,
    page,
    HISTORY_PAGE_SIZE,
  );
};

export const listDriverRemittanceHistory = (view: RemittanceView, page: number, driverId?: string) =>
  paged('driver_remittance_history', { p_driver_id: driverId ?? null, p_status: statusParam(view) }, page, 'driver');

// Driver submissions for operators (and managers) to count.
export const listDriverRemittanceQueue = (view: RemittanceView, page: number) =>
  paged('driver_remittance_queue', { p_status: statusParam(view) }, page, 'driver');

export const listOperatorRemittanceHistory = (view: RemittanceView, page: number, operatorId?: string) =>
  paged('operator_remittance_history', { p_operator_id: operatorId ?? null, p_status: statusParam(view) }, page, 'operator');

export type OperatorCashOverview = {
  weekStart: string;
  weekEnd: string;
  week: { received: number; confirmed: number };
  openingOutstanding: number;
  receivedCod: number;
  receivedFee: number;
  other: number;
  confirmedCod: number;
  confirmedFee: number;
  pendingCod: number;
  pendingFee: number;
  pendingCount: number;
  disputedCount: number;
  disputedAmount: number;
  outstanding: number;
  outstandingCod: number;
  outstandingFee: number;
  availableCod: number;
  availableFee: number;
  driverQueue: number;
};

export const getOperatorCashOverview = async (operatorId?: string): Promise<OperatorCashOverview | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('operator_cash_overview', operatorId ? { p_operator_id: operatorId } : {});
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const week = (row.week ?? {}) as Record<string, unknown>;
  return {
    weekStart: String(row.weekStart),
    weekEnd: String(row.weekEnd),
    week: { received: money(week.received), confirmed: money(week.confirmed) },
    openingOutstanding: money(row.openingOutstanding),
    receivedCod: money(row.receivedCod),
    receivedFee: money(row.receivedFee),
    other: money(row.other),
    confirmedCod: money(row.confirmedCod),
    confirmedFee: money(row.confirmedFee),
    pendingCod: money(row.pendingCod),
    pendingFee: money(row.pendingFee),
    pendingCount: Number(row.pendingCount ?? 0),
    disputedCount: Number(row.disputedCount ?? 0),
    disputedAmount: money(row.disputedAmount),
    outstanding: money(row.outstanding),
    outstandingCod: money(row.outstandingCod),
    outstandingFee: money(row.outstandingFee),
    availableCod: money(row.availableCod),
    availableFee: money(row.availableFee),
    driverQueue: Number(row.driverQueue ?? 0),
  };
};

export type OperatorCashWeek = { weekStart: string; opening: number; received: number; confirmed: number; closing: number };

export const listOperatorCashWeeks = async (operatorId?: string, weeks = 8): Promise<OperatorCashWeek[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('operator_cash_weeks', { p_operator_id: operatorId ?? null, p_weeks: weeks });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    weekStart: String(row.week_start),
    opening: money(row.opening),
    received: money(row.received),
    confirmed: money(row.confirmed),
    closing: money(row.closing),
  }));
};

export type OperatorBalance = {
  operatorId: string;
  operatorName: string;
  received: number;
  remitted: number;
  pending: number;
  outstanding: number;
  lastRemittedAt: string | null;
};

export const listOperatorCashBalances = async (): Promise<OperatorBalance[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('operator_cash_balances');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    operatorId: String(row.operator_id),
    operatorName: String(row.operator_name),
    received: money(row.received),
    remitted: money(row.remitted),
    pending: money(row.pending),
    outstanding: money(row.outstanding),
    lastRemittedAt: (row.last_remitted_at as string | null) ?? null,
  }));
};

export type ManagerCashTotals = {
  fromOperators: number;
  fromOperatorsCod: number;
  fromOperatorsFee: number;
  directFromDrivers: number;
  pendingFromOperators: number;
  pendingCount: number;
  heldByOperators: number;
  heldByDrivers: number;
};

export const getManagerCashTotals = async (): Promise<ManagerCashTotals | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('manager_cash_totals');
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    fromOperators: money(row.fromOperators),
    fromOperatorsCod: money(row.fromOperatorsCod),
    fromOperatorsFee: money(row.fromOperatorsFee),
    directFromDrivers: money(row.directFromDrivers),
    pendingFromOperators: money(row.pendingFromOperators),
    pendingCount: Number(row.pendingCount ?? 0),
    heldByOperators: money(row.heldByOperators),
    heldByDrivers: money(row.heldByDrivers),
  };
};

export { HISTORY_PAGE_SIZE };
