// The merchant bulk-shipment CSV: its columns, the official template, and
// turning one row's text into typed values. Pure (no I/O), shared by the
// browser (instant file checks) and the server (the real validation —
// services/bulk/merchant-bulk.ts — which never trusts the browser's).
//
// The file holds only what differs per recipient. Everything common to the
// whole batch is collected once or fixed by ParcelLink, never per row:
// the pickup address is entered once on the upload screen, and every bulk
// shipment is Next Day delivery and COD (MERCHANT_BULK_FIXED). Each row is
// still validated by the same bookingSchema and priced by the same
// quoteShipment() as a single booking.

import { msg } from '@/i18n/message';
import { toCsv } from '@/lib/csv/serialize';
import { MAX_COD_AMOUNT } from '@/lib/pricing/config';

import type { DeliveryType, PackageType, RecipientPaymentType } from '@/lib/types';

// The canonical columns, in template order. All are required.
export const MERCHANT_BULK_COLUMNS = [
  'recipient_name',
  'recipient_phone',
  'delivery_address',
  'package_description',
  'quantity',
  'weight_kg',
  'cod_amount',
  // The scheduled delivery date (stored as shipments.delivery_date).
  'date',
] as const;

export type MerchantBulkColumn = (typeof MERCHANT_BULK_COLUMNS)[number];

export const REQUIRED_MERCHANT_COLUMNS: readonly MerchantBulkColumn[] = MERCHANT_BULK_COLUMNS;

// Set by ParcelLink for every row of a bulk upload; no row can override them.
export const MERCHANT_BULK_FIXED: {
  deliveryType: DeliveryType;
  recipientPaymentType: RecipientPaymentType;
  packageType: PackageType;
  isFragile: boolean;
} = { deliveryType: 'next_day', recipientPaymentType: 'postpaid', packageType: 'parcel', isFragile: false };

// Columns of the previous (17-column) template, and the computed values
// merchants sometimes add themselves. A file with any of them was made from
// an old template: it is refused rather than half-read, so a stale
// pickup_address or delivery_type can never slip into a booking.
export const LEGACY_MERCHANT_COLUMNS = [
  'pickup_address',
  'pickup_contact_name',
  'pickup_contact_phone',
  'delivery_date',
  'delivery_type',
  'cod_type',
  'package_value',
  'package_type',
  'notes',
  'delivery_notes',
  'fragile',
  'distance',
  'distance_km',
  'coverage',
  'delivery_fee',
  'tracking_id',
] as const;

// No arbitrary low cap: a batch is booked in one database statement, and
// PostgREST returns at most 1,000 rows per read, which sets the ceiling.
export const MERCHANT_BULK_MAX_ROWS = 1000;
// Server actions accept bodies up to 1 MB; this leaves room for encoding.
export const MERCHANT_BULK_MAX_FILE_BYTES = 900_000;
// Longest value kept from any cell (the booking schema's own limits are lower).
export const MAX_CELL_LENGTH = 500;
// How far ahead a delivery can be scheduled.
export const MAX_DAYS_AHEAD = 60;
// The batch's one pickup address (shipment_batches.pickup_address).
export const PICKUP_ADDRESS_MIN = 5;
export const PICKUP_ADDRESS_MAX = 300;

export type MerchantRowInput = Record<MerchantBulkColumn, string>;

export const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// The template's example row, for a file downloaded `today` (its date is
// the earliest Next Day delivery: tomorrow).
export const templateExample = (today: string): MerchantRowInput => ({
  recipient_name: 'Ahmed Ali',
  recipient_phone: '+971501234567',
  delivery_address: 'Marina Gate 1, Dubai Marina, Dubai',
  package_description: 'Electronics',
  quantity: '1',
  weight_kg: '2.5',
  cod_amount: '150',
  date: addDays(today, 1),
});

// Lines above the column names are guidance: the parser skips everything
// before the header row (findHeaderRow), so they never become shipments.
export const TEMPLATE_TITLE = 'ParcelLink UAE - Merchant Bulk Shipment Template';
export const TEMPLATE_NOTE =
  'One shipment per row, under the column names. Do not rename the column names. Pickup address: chosen once in ParcelLink. Delivery: always Next Day. Payment: always COD (cod_amount = cash the driver collects).';
export const TEMPLATE_EXAMPLE_LABEL = 'EXAMPLE - NOT UPLOADED (the next line only shows the format):';

// The plain-CSV template: a short guide, one example line (above the column
// names, so it is never uploaded), then the column names for the data.
export const merchantTemplateCsv = (today: string) => {
  const example = templateExample(today);
  return `﻿${toCsv(
    [TEMPLATE_TITLE],
    [[TEMPLATE_NOTE], [TEMPLATE_EXAMPLE_LABEL], MERCHANT_BULK_COLUMNS.map((column) => example[column]), [...MERCHANT_BULK_COLUMNS]],
  )}`;
};

// ── The file's header ───────────────────────────────────────────────────────

export const normalizeHeader = (header: string) => header.replace(/^﻿/, '').trim().toLowerCase();

// Guidance rows the template puts above the column names (see the .xlsx
// template too); a file whose header isn't found in these is reported
// against its first line.
const HEADER_SEARCH_ROWS = 10;

// The index of the header row: the first record with a recipient_name (or,
// for an old file, pickup_address) column.
export const findHeaderRow = (records: { cells: string[] }[]) => {
  const index = records
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex(({ cells }) => cells.some((cell) => ['recipient_name', 'pickup_address'].includes(normalizeHeader(cell))));
  return index === -1 ? 0 : index;
};

export const missingMerchantColumns = (headers: string[]) => REQUIRED_MERCHANT_COLUMNS.filter((column) => !headers.includes(column));

// Why a header row can't be used, or null when it can.
export const merchantHeaderError = (headers: string[]): string | null => {
  const legacy = headers.filter((header) => (LEGACY_MERCHANT_COLUMNS as readonly string[]).includes(header));
  if (legacy.length > 0) return msg('bulk.errors.outdatedTemplate', { columns: legacy.join(', ') });
  const missing = missingMerchantColumns(headers);
  if (missing.length > 0) return msg('bulk.errors.missingColumns', { columns: missing.join(', ') });
  const unknown = headers.filter((header) => header !== '' && !(MERCHANT_BULK_COLUMNS as readonly string[]).includes(header));
  if (unknown.length > 0) return msg('bulk.errors.unknownColumns', { columns: unknown.join(', ') });
  const repeated = headers.filter((header, i) => header !== '' && headers.indexOf(header) !== i);
  if (repeated.length > 0) return msg('bulk.errors.repeatedColumns', { columns: [...new Set(repeated)].join(', ') });
  return null;
};

// The header row and the data rows under it, or why the file can't be read.
export const readMerchantTable = <T extends { cells: string[] }>(records: T[]): { headers: string[]; rows: T[] } | { error: string } => {
  if (records.length === 0) return { error: 'bulk.errors.empty' };
  const index = findHeaderRow(records);
  const headers = records[index].cells.map(normalizeHeader);
  const error = merchantHeaderError(headers);
  if (error) return { error };
  const rows = records.slice(index + 1);
  if (rows.length === 0) return { error: 'bulk.errors.empty' };
  if (rows.length > MERCHANT_BULK_MAX_ROWS) return { error: msg('bulk.errors.tooMany', { max: MERCHANT_BULK_MAX_ROWS, count: rows.length }) };
  return { headers, rows };
};

// Control characters (other than tab/newline) never belong in a shipment
// field. Values are stored and shown as text, never evaluated; exports
// escape formula triggers (lib/csv/serialize.ts).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// A leading ' before + = - @ is the formula-injection escape that
// toCsv() adds on export (the template's "+971…" phone, a re-uploaded
// report); it isn't part of the value.
export const cleanCell = (value: string | undefined) =>
  (value ?? '').replace(CONTROL, '').trim().replace(/^'(?=[=+\-@])/, '').slice(0, MAX_CELL_LENGTH);

// One CSV record (headers already normalized) → the template's columns.
export const toMerchantRowInput = (record: Record<string, string>): MerchantRowInput =>
  Object.fromEntries(MERCHANT_BULK_COLUMNS.map((column) => [column, cleanCell(record[column])])) as MerchantRowInput;

// Identical rows (ignoring case and spacing) are probably a copy-paste slip.
export const normalizedRowKey = (input: MerchantRowInput) =>
  MERCHANT_BULK_COLUMNS.map((column) => (input[column] ?? '').replace(/\s+/g, ' ').toLowerCase()).join('\u001F');

// ── Parsing one row ─────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning';
// `field` is a template column; 'pickup_address' (the batch's pickup),
// 'distance' or 'coverage' (found by the server); or the whole 'row'.
export type RowIssue = {
  field: MerchantBulkColumn | 'pickup_address' | 'distance' | 'coverage' | 'row';
  message: string;
  severity: IssueSeverity;
};

export type ParsedMerchantRow = {
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  packageDescription: string;
  quantity: number;
  weightKg: number;
  codAmount: number;
  deliveryDate: string;
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
  // A row stored by another version of the form may lack a column.
  const value = (column: MerchantBulkColumn) => input[column] ?? '';

  for (const field of ['recipient_name', 'recipient_phone', 'delivery_address', 'package_description'] as const) {
    if (!value(field)) issues.push(required(field));
  }
  if (value('recipient_phone') && !isUaePhone(value('recipient_phone'))) {
    issues.push({ field: 'recipient_phone', message: 'bulk.issues.nonUaePhone', severity: 'warning' });
  }

  const quantity = toNumber(value('quantity'));
  if (value('quantity') === '') issues.push(required('quantity'));
  else if (!Number.isInteger(quantity) || quantity < 1) issues.push(invalid('quantity', 'bulk.validation.positiveWhole'));

  const weightKg = toNumber(value('weight_kg'));
  if (value('weight_kg') === '') issues.push(required('weight_kg'));
  else if (!Number.isFinite(weightKg) || weightKg <= 0) issues.push(invalid('weight_kg', 'bulk.validation.positiveNumber'));

  // Every bulk shipment is COD: there is always an amount to collect.
  const codAmount = toNumber(value('cod_amount'));
  if (value('cod_amount') === '') issues.push(required('cod_amount'));
  else if (!Number.isFinite(codAmount)) issues.push(invalid('cod_amount', 'bulk.validation.number'));
  else if (codAmount <= 0) issues.push(invalid('cod_amount', 'bulk.validation.codPositive'));
  else if (codAmount > MAX_COD_AMOUNT) issues.push(invalid('cod_amount', 'bulk.validation.codMax', { max: MAX_COD_AMOUNT }));

  // Every bulk shipment is Next Day: the earliest date is tomorrow.
  const deliveryDate = parseCsvDate(value('date'));
  if (value('date') === '') issues.push(required('date'));
  else if (!deliveryDate) issues.push(invalid('date', 'bulk.validation.date'));
  else if (deliveryDate < today) issues.push(invalid('date', 'bulk.validation.datePast'));
  else if (deliveryDate === today) issues.push(invalid('date', 'bulk.validation.nextDayToday'));
  else if (deliveryDate > addDays(today, MAX_DAYS_AHEAD)) issues.push(invalid('date', 'bulk.validation.dateTooFar', { days: MAX_DAYS_AHEAD }));

  if (issues.some((issue) => issue.severity === 'error')) return { row: null, issues };

  return {
    row: {
      recipientName: value('recipient_name'),
      recipientPhone: value('recipient_phone'),
      deliveryAddress: value('delivery_address'),
      packageDescription: value('package_description'),
      quantity,
      weightKg,
      codAmount,
      deliveryDate: deliveryDate!,
    },
    issues,
  };
};

// bookingSchema paths → the field the merchant should fix.
const PATH_FIELDS: Record<string, RowIssue['field']> = {
  'pickup.address': 'pickup_address',
  'dropoff.address': 'delivery_address',
  'dropoff.contactName': 'recipient_name',
  'dropoff.contactPhone': 'recipient_phone',
  packageDescription: 'package_description',
  packageQuantity: 'quantity',
  packageWeightKg: 'weight_kg',
  codAmount: 'cod_amount',
};

export const fieldForBookingPath = (path: PropertyKey[]): RowIssue['field'] => PATH_FIELDS[path.map(String).join('.')] ?? 'row';

// ── Row state ───────────────────────────────────────────────────────────────

export const ROW_STATUSES = ['pending', 'valid', 'warning', 'invalid'] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

export const rowStatusFor = (issues: RowIssue[]): Exclude<RowStatus, 'pending'> =>
  issues.some((issue) => issue.severity === 'error') ? 'invalid' : issues.length > 0 ? 'warning' : 'valid';

export const isBookableStatus = (status: RowStatus) => status === 'valid' || status === 'warning';
