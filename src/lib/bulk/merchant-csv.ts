// The merchant bulk-shipment CSV: its columns, the official template, and
// turning one row's text into typed values. Pure (no I/O), shared by the
// browser (instant file checks) and the server (the real validation —
// services/bulk/merchant-bulk.ts — which never trusts the browser's).
//
// Columns map onto the normal booking input (lib/shipment/schemas.ts):
// every row is ultimately validated by the same bookingSchema and priced by
// the same quoteShipment() as a single booking.

import { msg } from '@/i18n/message';
import { toCsv } from '@/lib/csv/serialize';
import { DELIVERY_TYPES, PACKAGE_TYPES } from '@/lib/types';

import type { DeliveryType, PackageType, RecipientPaymentType } from '@/lib/types';

export const MERCHANT_BULK_COLUMNS = [
  'recipient_name',
  'recipient_phone',
  'pickup_address',
  'delivery_address',
  'package_description',
  'quantity',
  'weight_kg',
  'package_value',
  'delivery_date',
  'cod_type',
  'cod_amount',
  'notes',
  // Optional extras; defaults in parseMerchantRow.
  'delivery_type',
  'package_type',
  'fragile',
  'pickup_contact_name',
  'pickup_contact_phone',
] as const;

export type MerchantBulkColumn = (typeof MERCHANT_BULK_COLUMNS)[number];

// A file must have these headers. (Weight is required for every booking —
// merchant prices depend on it, and the database refuses a merchant
// shipment without one.)
export const REQUIRED_MERCHANT_COLUMNS: MerchantBulkColumn[] = [
  'recipient_name',
  'recipient_phone',
  'pickup_address',
  'delivery_address',
  'package_description',
  'quantity',
  'weight_kg',
  'delivery_date',
  'cod_type',
];

// No arbitrary low cap: a batch is booked in one database statement, and
// PostgREST returns at most 1,000 rows per read, which sets the ceiling.
export const MERCHANT_BULK_MAX_ROWS = 1000;
// Server actions accept bodies up to 1 MB; this leaves room for encoding.
export const MERCHANT_BULK_MAX_FILE_BYTES = 900_000;
// Longest value kept from any cell (the booking schema's own limits are lower).
export const MAX_CELL_LENGTH = 500;
// How far ahead a delivery can be scheduled.
export const MAX_DAYS_AHEAD = 60;

export type MerchantRowInput = Record<MerchantBulkColumn, string>;

export const TEMPLATE_EXAMPLE: MerchantRowInput = {
  recipient_name: 'Ahmed Ali',
  recipient_phone: '+971501234567',
  pickup_address: 'Business Bay, Dubai',
  delivery_address: 'Dubai Marina, Dubai',
  package_description: 'Electronics',
  quantity: '1',
  weight_kg: '2.5',
  package_value: '500',
  delivery_date: '',
  cod_type: 'Postpaid',
  cod_amount: '150',
  notes: 'Handle with care',
  delivery_type: 'same_day',
  package_type: 'parcel',
  fragile: 'no',
  pickup_contact_name: '',
  pickup_contact_phone: '',
};

// The downloadable template: headers plus one example row dated `today`.
export const merchantTemplateCsv = (today: string) =>
  `﻿${toCsv([...MERCHANT_BULK_COLUMNS], [MERCHANT_BULK_COLUMNS.map((column) => (column === 'delivery_date' ? today : TEMPLATE_EXAMPLE[column]))])}`;

export const missingMerchantColumns = (headers: string[]) => REQUIRED_MERCHANT_COLUMNS.filter((column) => !headers.includes(column));

// Control characters (other than tab/newline) never belong in a shipment
// field. Values are stored and shown as text, never evaluated; exports
// escape formula triggers (lib/csv/serialize.ts).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// A leading ' before + = - @ is the formula-injection escape that
// toCsv() adds on export (the template's "+971…" phone, a re-uploaded
// report); it isn't part of the value.
export const cleanCell = (value: string | undefined) =>
  (value ?? '').replace(CONTROL, '').trim().replace(/^'(?=[=+\-@])/, '').slice(0, MAX_CELL_LENGTH);

// One CSV record (headers already lowercased) → the template's columns.
export const toMerchantRowInput = (record: Record<string, string>): MerchantRowInput =>
  Object.fromEntries(MERCHANT_BULK_COLUMNS.map((column) => [column, cleanCell(record[column])])) as MerchantRowInput;

// Identical rows (ignoring case and spacing) are probably a copy-paste slip.
export const normalizedRowKey = (input: MerchantRowInput) =>
  MERCHANT_BULK_COLUMNS.map((column) => input[column].replace(/\s+/g, ' ').toLowerCase()).join('\u001F');

// ── Parsing one row ─────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning';
// `field` is a template column, or 'distance' / 'coverage' / 'row'.
export type RowIssue = { field: MerchantBulkColumn | 'distance' | 'coverage' | 'row'; message: string; severity: IssueSeverity };

export type ParsedMerchantRow = {
  recipientName: string;
  recipientPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  packageDescription: string;
  quantity: number;
  weightKg: number;
  packageValue: number | undefined;
  deliveryDate: string;
  recipientPaymentType: RecipientPaymentType;
  codAmount: number | undefined;
  notes: string;
  deliveryType: DeliveryType;
  packageType: PackageType;
  isFragile: boolean;
  pickupContactName: string;
  pickupContactPhone: string;
};

const required = (field: MerchantBulkColumn): RowIssue => ({ field, message: msg('bulk.validation.required', { column: field }), severity: 'error' });
const invalid = (field: MerchantBulkColumn, key: string, values: Record<string, string | number> = {}): RowIssue => ({
  field,
  message: msg(key, { column: field, ...values }),
  severity: 'error',
});

const toNumber = (value: string) => {
  // "1,250.50" from a spreadsheet's number format.
  const text = value.replace(/,(?=\d{3}(\D|$))/g, '').replace(/^AED\s*/i, '');
  return text === '' || !/^-?\d+(\.\d+)?$/.test(text) ? NaN : Number(text);
};

const COD_TYPES: Record<string, RecipientPaymentType> = {
  prepaid: 'prepaid',
  'pre-paid': 'prepaid',
  paid: 'prepaid',
  postpaid: 'postpaid',
  'post-paid': 'postpaid',
  cod: 'postpaid',
  'cash on delivery': 'postpaid',
};

const TRUTHY = ['yes', 'y', 'true', '1'];
const FALSY = ['', 'no', 'n', 'false', '0'];

// YYYY-MM-DD, or DD/MM/YYYY (what spreadsheets in the UAE often save).
export const parseCsvDate = (value: string): string | null => {
  let year: number;
  let month: number;
  let day: number;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
};

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// A UAE mobile or landline: +971 / 00971 / 971 / 0, then 8–9 digits.
// Other countries' numbers are allowed (the booking flow accepts them) but
// flagged, since a courier can't usually call them.
export const isUaePhone = (phone: string) => /^(?:\+971|00971|971|0)(?:5\d{8}|[2-9]\d{7})$/.test(phone.replace(/[\s()-]/g, ''));

// Typed values and every problem with the row's text. Address, coverage,
// distance and price checks need Google and run on the server afterwards.
export const parseMerchantRow = (
  input: MerchantRowInput,
  today: string,
): { row: ParsedMerchantRow | null; issues: RowIssue[] } => {
  const issues: RowIssue[] = [];

  for (const field of ['recipient_name', 'recipient_phone', 'pickup_address', 'delivery_address', 'package_description'] as const) {
    if (!input[field]) issues.push(required(field));
  }
  if (input.recipient_phone && !isUaePhone(input.recipient_phone)) {
    issues.push({ field: 'recipient_phone', message: 'bulk.issues.nonUaePhone', severity: 'warning' });
  }

  const quantity = input.quantity === '' ? NaN : toNumber(input.quantity);
  if (input.quantity === '') issues.push(required('quantity'));
  else if (!Number.isInteger(quantity) || quantity < 1) issues.push(invalid('quantity', 'bulk.validation.positiveWhole'));

  const weightKg = toNumber(input.weight_kg);
  if (input.weight_kg === '') issues.push(required('weight_kg'));
  else if (!Number.isFinite(weightKg) || weightKg <= 0) issues.push(invalid('weight_kg', 'bulk.validation.positiveNumber'));

  const packageValue = input.package_value === '' ? undefined : toNumber(input.package_value);
  if (packageValue !== undefined && (!Number.isFinite(packageValue) || packageValue < 0)) {
    issues.push(invalid('package_value', 'bulk.validation.nonNegative'));
  }

  const deliveryDate = parseCsvDate(input.delivery_date);
  if (input.delivery_date === '') issues.push(required('delivery_date'));
  else if (!deliveryDate) issues.push(invalid('delivery_date', 'bulk.validation.date'));
  else if (deliveryDate < today) issues.push(invalid('delivery_date', 'bulk.validation.datePast'));
  else if (deliveryDate > addDays(today, MAX_DAYS_AHEAD)) issues.push(invalid('delivery_date', 'bulk.validation.dateTooFar', { days: MAX_DAYS_AHEAD }));

  const recipientPaymentType = COD_TYPES[input.cod_type.toLowerCase()];
  if (input.cod_type === '') issues.push(required('cod_type'));
  else if (!recipientPaymentType) issues.push(invalid('cod_type', 'bulk.validation.codType'));

  const codAmount = input.cod_amount === '' ? undefined : toNumber(input.cod_amount);
  if (codAmount !== undefined && !Number.isFinite(codAmount)) issues.push(invalid('cod_amount', 'bulk.validation.number'));
  else if (recipientPaymentType === 'prepaid' && codAmount) issues.push(invalid('cod_amount', 'bulk.validation.prepaidCod'));
  else if (recipientPaymentType === 'postpaid' && !(codAmount && codAmount > 0)) issues.push(invalid('cod_amount', 'bulk.validation.postpaidCod'));

  const deliveryType = (input.delivery_type || 'same_day').toLowerCase().replace(/[\s-]+/g, '_') as DeliveryType;
  if (!DELIVERY_TYPES.includes(deliveryType)) issues.push(invalid('delivery_type', 'bulk.validation.oneOf', { values: DELIVERY_TYPES.join(', ') }));
  else if (deliveryType === 'next_day' && deliveryDate && deliveryDate === today) {
    issues.push(invalid('delivery_date', 'bulk.validation.nextDayToday'));
  }

  const packageType = (input.package_type || 'parcel').toLowerCase() as PackageType;
  if (!PACKAGE_TYPES.includes(packageType)) issues.push(invalid('package_type', 'bulk.validation.oneOf', { values: PACKAGE_TYPES.join(', ') }));

  const fragile = input.fragile.toLowerCase();
  if (!TRUTHY.includes(fragile) && !FALSY.includes(fragile)) issues.push(invalid('fragile', 'bulk.validation.yesNo'));

  if (issues.some((issue) => issue.severity === 'error')) return { row: null, issues };

  return {
    row: {
      recipientName: input.recipient_name,
      recipientPhone: input.recipient_phone,
      pickupAddress: input.pickup_address,
      deliveryAddress: input.delivery_address,
      packageDescription: input.package_description,
      quantity,
      weightKg,
      packageValue,
      deliveryDate: deliveryDate!,
      recipientPaymentType,
      codAmount: recipientPaymentType === 'postpaid' ? codAmount : undefined,
      notes: input.notes,
      deliveryType,
      packageType,
      isFragile: TRUTHY.includes(fragile),
      pickupContactName: input.pickup_contact_name,
      pickupContactPhone: input.pickup_contact_phone,
    },
    issues,
  };
};

// bookingSchema paths → the template column the merchant should fix.
const PATH_FIELDS: Record<string, MerchantBulkColumn> = {
  'pickup.address': 'pickup_address',
  'pickup.contactName': 'pickup_contact_name',
  'pickup.contactPhone': 'pickup_contact_phone',
  'dropoff.address': 'delivery_address',
  'dropoff.contactName': 'recipient_name',
  'dropoff.contactPhone': 'recipient_phone',
  'dropoff.instructions': 'notes',
  packageDescription: 'package_description',
  packageQuantity: 'quantity',
  packageWeightKg: 'weight_kg',
  productValue: 'package_value',
  codAmount: 'cod_amount',
  recipientPaymentType: 'cod_type',
  deliveryType: 'delivery_type',
  packageType: 'package_type',
};

export const fieldForBookingPath = (path: PropertyKey[]): RowIssue['field'] => PATH_FIELDS[path.map(String).join('.')] ?? 'row';

// ── Row state ───────────────────────────────────────────────────────────────

export const ROW_STATUSES = ['pending', 'valid', 'warning', 'invalid'] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

export const rowStatusFor = (issues: RowIssue[]): Exclude<RowStatus, 'pending'> =>
  issues.some((issue) => issue.severity === 'error') ? 'invalid' : issues.length > 0 ? 'warning' : 'valid';

export const isBookableStatus = (status: RowStatus) => status === 'valid' || status === 'warning';
