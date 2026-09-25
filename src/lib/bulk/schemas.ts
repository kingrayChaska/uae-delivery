import { z } from '@/lib/zod';

import { BULK_COLUMNS } from '@/lib/business/schemas';

import type { ShipmentStatus } from '@/lib/types';

export const BATCH_STATUSES = ['processing', 'submitted', 'partially_failed', 'failed'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export type BulkRowResult = { rowNumber: number; ok: boolean; message: string };

// Pickup dates are UAE calendar days, whatever timezone the server or the
// browser happens to run in.
export const todayInUae = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date());

export const bulkBatchDetailsSchema = z.object({
  name: z.string().trim().min(2, 'Give this list a name').max(120, 'Keep the name under 120 characters'),
  pickupDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a pickup date')
    .refine((value) => value >= todayInUae(), 'Pickup date cannot be in the past'),
  notes: z.string().trim().max(1000, 'Keep notes under 1000 characters'),
  businessAccountId: z.string().uuid().nullable(),
  // One id per submission attempt, reused on retries — see migration 0020.
  clientRequestId: z.string().uuid(),
});

export type BulkBatchDetailsInput = z.infer<typeof bulkBatchDetailsSchema>;

export const PICKUP_COLUMNS = ['pickup_address', 'pickup_contact_name', 'pickup_contact_phone'] as const;
export type PickupDefaults = Record<(typeof PICKUP_COLUMNS)[number], string>;

export type BulkRecord = Record<(typeof BULK_COLUMNS)[number], string>;

export const emptyBulkRecord = (): BulkRecord =>
  Object.fromEntries(BULK_COLUMNS.map((column) => [column, ''])) as BulkRecord;

// Organisations usually ship everything from one warehouse, so the list has
// one default pickup; a row only needs pickup columns when it differs.
export const applyPickupDefaults = (records: Record<string, string>[], defaults: PickupDefaults) =>
  records.map((record) => ({
    ...record,
    ...Object.fromEntries(
      PICKUP_COLUMNS.map((column) => [column, (record[column] ?? '').trim() || defaults[column].trim()]),
    ),
  }));

// Keeps only known columns as trimmed, length-capped strings — rows arrive
// from the browser as JSON, so nothing about their shape is trusted.
export const sanitizeBulkRecords = (rows: unknown): BulkRecord[] | null => {
  if (!Array.isArray(rows)) return null;
  return rows.map((row) => {
    const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    return Object.fromEntries(
      BULK_COLUMNS.map((column) => {
        const value = source[column];
        return [column, typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, 500) : ''];
      }),
    ) as BulkRecord;
  });
};

// For CSV imports into the customer list editor: pickup columns are
// optional there because the list-level default pickup fills them in.
export const CUSTOMER_REQUIRED_COLUMNS = [
  'dropoff_address',
  'dropoff_contact_name',
  'dropoff_contact_phone',
  'package_description',
] as const;

export const missingCustomerBulkColumns = (headers: string[]) =>
  CUSTOMER_REQUIRED_COLUMNS.filter((column) => !headers.includes(column));

const AWAITING: ShipmentStatus[] = ['pending_payment', 'confirmed'];
const IN_PROGRESS: ShipmentStatus[] = ['assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination'];
const ISSUES: ShipmentStatus[] = ['delivery_failed', 'cancelled', 'returned'];

export type BatchProgress = { awaitingDispatch: number; inProgress: number; delivered: number; issues: number };

export const summarizeBatchProgress = (statuses: ShipmentStatus[]): BatchProgress => ({
  awaitingDispatch: statuses.filter((s) => AWAITING.includes(s)).length,
  inProgress: statuses.filter((s) => IN_PROGRESS.includes(s)).length,
  delivered: statuses.filter((s) => s === 'delivered').length,
  issues: statuses.filter((s) => ISSUES.includes(s)).length,
});
