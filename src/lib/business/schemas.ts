import { z } from '@/lib/zod';
import { msg } from '@/i18n/message';

import { DELIVERY_TYPES, PACKAGE_TYPES, PAYMENT_METHODS } from '@/lib/types';

export const businessAccountSchema = z.object({
  companyName: z.string().trim().min(2, 'manager.business.validation.companyName'),
  contactPerson: z.string().trim().min(2, 'manager.business.validation.contactPerson'),
  contactEmail: z.string().trim().email('manager.business.validation.email'),
  contactPhone: z.string().trim().min(7, 'manager.business.validation.phone'),
  billingAddress: z.string().trim().optional(),
  trn: z.string().trim().optional(),
});

export type BusinessAccountInput = z.infer<typeof businessAccountSchema>;

export const BULK_MAX_ROWS = 50;

export const BULK_COLUMNS = [
  'pickup_address',
  'pickup_contact_name',
  'pickup_contact_phone',
  'dropoff_address',
  'dropoff_contact_name',
  'dropoff_contact_phone',
  'package_type',
  'package_description',
  'quantity',
  'weight_kg',
  'fragile',
  'payment_method',
  'delivery_type',
  'cod_amount',
] as const;

// Columns a CSV may leave out — each has a default.
export const OPTIONAL_BULK_COLUMNS = ['weight_kg', 'fragile', 'payment_method', 'package_type', 'quantity', 'delivery_type', 'cod_amount'];

const truthy = ['yes', 'y', 'true', '1'];

// Row errors are translation keys naming the CSV column (the column names
// themselves stay as written in the file).
const required = (column: string) => msg('manager.bulk.validation.required', { column });
const invalid = (column: string) => msg('manager.bulk.validation.invalid', { column });

// One CSV row -> the fields the booking pipeline needs (minus coordinates,
// which the server geocodes). Used by BOTH the in-browser preview and the
// server action, so the preview never approves something the server rejects.
export const bulkRowSchema = z.object({
  pickup_address: z.string().min(3, required('pickup_address')),
  pickup_contact_name: z.string().min(2, required('pickup_contact_name')),
  pickup_contact_phone: z.string().min(7, invalid('pickup_contact_phone')),
  dropoff_address: z.string().min(3, required('dropoff_address')),
  dropoff_contact_name: z.string().min(2, required('dropoff_contact_name')),
  dropoff_contact_phone: z.string().min(7, invalid('dropoff_contact_phone')),
  package_type: z
    .string()
    .transform((value) => (value || 'parcel').toLowerCase())
    .pipe(z.enum(PACKAGE_TYPES, { error: msg('manager.bulk.validation.oneOf', { column: 'package_type', values: PACKAGE_TYPES.join(', ') }) })),
  package_description: z.string().min(1, required('package_description')),
  quantity: z
    .string()
    .transform((value) => Number(value || '1'))
    .pipe(
      z
        .number()
        .int(msg('manager.bulk.validation.whole', { column: 'quantity' }))
        .min(1, msg('manager.bulk.validation.atLeastOne', { column: 'quantity' })),
    ),
  weight_kg: z
    .string()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().min(0, msg('manager.bulk.validation.positive', { column: 'weight_kg' })).optional()),
  fragile: z.string().transform((value) => truthy.includes(value.toLowerCase())),
  payment_method: z
    .string()
    .transform((value) => (value || 'cod').toLowerCase())
    .pipe(z.enum(PAYMENT_METHODS, { error: msg('manager.bulk.validation.oneOf', { column: 'payment_method', values: PAYMENT_METHODS.join(', ') }) })),
  delivery_type: z
    .string()
    .transform((value) => (value || 'same_day').toLowerCase().replace(/[\s-]+/g, '_'))
    .pipe(z.enum(DELIVERY_TYPES, { error: msg('manager.bulk.validation.oneOf', { column: 'delivery_type', values: DELIVERY_TYPES.join(', ') }) })),
  // Amount to collect from the recipient for the goods; blank or 0 = prepaid.
  cod_amount: z
    .string()
    .transform((value) => Number(value || '0'))
    .pipe(
      z
        .number({ error: msg('manager.bulk.validation.number', { column: 'cod_amount' }) })
        .min(0, msg('manager.bulk.validation.negative', { column: 'cod_amount' }))
        .max(100000, msg('manager.bulk.validation.tooLarge', { column: 'cod_amount' })),
    ),
});

export type BulkRow = z.infer<typeof bulkRowSchema>;

export type BulkRowValidation = { rowNumber: number; row: BulkRow | null; error: string | null };

export const validateBulkRecords = (records: Record<string, string>[]): BulkRowValidation[] => {
  return records.map((record, index) => {
    const result = bulkRowSchema.safeParse(Object.fromEntries(BULK_COLUMNS.map((c) => [c, record[c] ?? ''])));
    return {
      rowNumber: index + 2, // +1 for header, +1 for 1-based spreadsheet rows
      row: result.success ? result.data : null,
      error: result.success ? null : (result.error.issues[0]?.message ?? 'manager.bulk.validation.row'),
    };
  });
};

export const missingBulkColumns = (headers: string[]) =>
  BULK_COLUMNS.filter((column) => !OPTIONAL_BULK_COLUMNS.includes(column))
    .filter((column) => !headers.includes(column));
