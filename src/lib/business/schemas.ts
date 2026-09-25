import { z } from '@/lib/zod';

import { PACKAGE_TYPES, PAYMENT_METHODS } from '@/lib/types';

export const businessAccountSchema = z.object({
  companyName: z.string().trim().min(2, 'Enter a company name'),
  contactPerson: z.string().trim().min(2, 'Enter a contact person'),
  contactEmail: z.string().trim().email('Enter a valid email'),
  contactPhone: z.string().trim().min(7, 'Enter a valid phone number'),
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
] as const;

const truthy = ['yes', 'y', 'true', '1'];

// One CSV row -> the fields the booking pipeline needs (minus coordinates,
// which the server geocodes). Used by BOTH the in-browser preview and the
// server action, so the preview never approves something the server rejects.
export const bulkRowSchema = z.object({
  pickup_address: z.string().min(3, 'pickup_address is required'),
  pickup_contact_name: z.string().min(2, 'pickup_contact_name is required'),
  pickup_contact_phone: z.string().min(7, 'pickup_contact_phone is invalid'),
  dropoff_address: z.string().min(3, 'dropoff_address is required'),
  dropoff_contact_name: z.string().min(2, 'dropoff_contact_name is required'),
  dropoff_contact_phone: z.string().min(7, 'dropoff_contact_phone is invalid'),
  package_type: z
    .string()
    .transform((value) => (value || 'parcel').toLowerCase())
    .pipe(z.enum(PACKAGE_TYPES, { error: `package_type must be one of: ${PACKAGE_TYPES.join(', ')}` })),
  package_description: z.string().min(1, 'package_description is required'),
  quantity: z
    .string()
    .transform((value) => Number(value || '1'))
    .pipe(z.number().int('quantity must be a whole number').min(1, 'quantity must be at least 1')),
  weight_kg: z
    .string()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().min(0, 'weight_kg must be positive').optional()),
  fragile: z.string().transform((value) => truthy.includes(value.toLowerCase())),
  payment_method: z
    .string()
    .transform((value) => (value || 'cod').toLowerCase())
    .pipe(z.enum(PAYMENT_METHODS, { error: 'payment_method must be card or cod' })),
});

export type BulkRow = z.infer<typeof bulkRowSchema>;

export type BulkRowValidation = { rowNumber: number; row: BulkRow | null; error: string | null };

export const validateBulkRecords = (records: Record<string, string>[]): BulkRowValidation[] => {
  return records.map((record, index) => {
    const result = bulkRowSchema.safeParse(Object.fromEntries(BULK_COLUMNS.map((c) => [c, record[c] ?? ''])));
    return {
      rowNumber: index + 2, // +1 for header, +1 for 1-based spreadsheet rows
      row: result.success ? result.data : null,
      error: result.success ? null : (result.error.issues[0]?.message ?? 'Invalid row'),
    };
  });
};

export const missingBulkColumns = (headers: string[]) =>
  BULK_COLUMNS.filter((column) => !['weight_kg', 'fragile', 'payment_method', 'package_type', 'quantity'].includes(column))
    .filter((column) => !headers.includes(column));
