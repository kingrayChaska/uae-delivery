import { z } from '@/lib/zod';

import { COD_STATUSES } from '@/lib/types';

// Driver cash reconciliation (migration 0042). The database computes every
// balance; these only describe what the pages and forms send it.

export const REMITTANCE_METHODS = ['cash', 'bank_transfer', 'other'] as const;
export type RemittanceMethod = (typeof REMITTANCE_METHODS)[number];

export const REMITTANCE_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export type RemittanceStatus = (typeof REMITTANCE_STATUSES)[number];

export const MAX_REMITTANCE_AMOUNT = 1_000_000;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => isoDate.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const hasAtMostTwoDecimals = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
const dateParam = (value: string | string[] | undefined) => {
  const date = first(value).trim();
  return validDate(date) ? date : null;
};

// ── Dashboard filters (in the URL) ──────────────────────────────────────
// A date range filters period activity (collected / remitted in it); the
// outstanding balance is always today's.
export type CashFilters = { q: string; from: string | null; to: string | null };

export const parseCashFilters = (params: {
  q?: string | string[];
  from?: string | string[];
  to?: string | string[];
}): CashFilters => {
  let from = dateParam(params.from);
  let to = dateParam(params.to);
  if (from && to && from > to) [from, to] = [to, from];
  return { q: first(params.q).trim().slice(0, 100), from, to };
};

export const COLLECTION_FILTERS = ['all', ...COD_STATUSES, 'unverified'] as const;
export type CollectionFilter = (typeof COLLECTION_FILTERS)[number];
export const REMITTANCE_FILTERS = ['all', ...REMITTANCE_STATUSES] as const;
export type RemittanceFilter = (typeof REMITTANCE_FILTERS)[number];

export type DriverLedgerFilters = CashFilters & { collection: CollectionFilter; remittance: RemittanceFilter };

export const parseDriverLedgerFilters = (params: {
  q?: string | string[];
  from?: string | string[];
  to?: string | string[];
  collection?: string | string[];
  remittance?: string | string[];
}): DriverLedgerFilters => {
  const collection = first(params.collection) as CollectionFilter;
  const remittance = first(params.remittance) as RemittanceFilter;
  return {
    ...parseCashFilters(params),
    collection: COLLECTION_FILTERS.includes(collection) ? collection : 'all',
    remittance: REMITTANCE_FILTERS.includes(remittance) ? remittance : 'all',
  };
};

// The URL for a filtered list; empty filters are left out.
export const cashHref = (path: string, filters: Partial<DriverLedgerFilters>) => {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.collection && filters.collection !== 'all') params.set('collection', filters.collection);
  if (filters.remittance && filters.remittance !== 'all') params.set('remittance', filters.remittance);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

// ── Recording a remittance ──────────────────────────────────────────────
export const remittanceSchema = z.object({
  driverId: z.string().uuid('operator.cash.validation.driver'),
  amount: z
    .number({ error: 'operator.cash.validation.amount' })
    .positive('operator.cash.validation.amount')
    .max(MAX_REMITTANCE_AMOUNT, 'operator.cash.validation.amountTooLarge')
    .refine(hasAtMostTwoDecimals, 'operator.cash.validation.twoDecimals'),
  method: z.enum(REMITTANCE_METHODS, { error: 'operator.cash.validation.method' }),
  receivedOn: z.string().refine(validDate, 'operator.cash.validation.date'),
  reference: z.string().trim().max(100, 'operator.cash.validation.referenceTooLong').optional(),
  notes: z.string().trim().max(500, 'operator.cash.validation.notesTooLong').optional(),
  // One per form submission, reused on retries: the database returns the
  // original remittance instead of recording it twice.
  clientRequestId: z.string().uuid(),
});

export type RemittanceInput = z.infer<typeof remittanceSchema>;

export const remittanceDecisionSchema = z
  .object({
    remittanceId: z.string().uuid(),
    decision: z.enum(['confirmed', 'rejected']),
    note: z.string().trim().max(500, 'operator.cash.validation.notesTooLong').optional(),
  })
  .refine((value) => value.decision === 'confirmed' || (value.note ?? '').length > 0, {
    path: ['note'],
    message: 'operator.cash.validation.rejectReason',
  });

export type RemittanceDecisionInput = z.infer<typeof remittanceDecisionSchema>;
