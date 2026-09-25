'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { submitBulkBatchAction } from '@/lib/bulk/actions';
import { parseCsvWithHeaders } from '@/lib/csv/parse';
import { BULK_COLUMNS, BULK_MAX_ROWS, validateBulkRecords } from '@/lib/business/schemas';
import {
  PICKUP_COLUMNS,
  applyPickupDefaults,
  bulkBatchDetailsSchema,
  emptyBulkRecord,
  missingCustomerBulkColumns,
} from '@/lib/bulk/schemas';

import type { BulkRecord, PickupDefaults } from '@/lib/bulk/schemas';

const MAX_FILE_BYTES = 500_000;

export type BulkListRow = { key: string; record: BulkRecord; customPickup: boolean };
export type BulkListDetails = { name: string; pickupDate: string; notes: string; businessAccountId: string };

const newRecord = (): BulkRecord => ({
  ...emptyBulkRecord(),
  package_type: 'parcel',
  quantity: '1',
  fragile: 'no',
  payment_method: 'cod',
});

const newRow = (record: BulkRecord = newRecord(), customPickup = false): BulkListRow => ({
  key: crypto.randomUUID(),
  record,
  customPickup,
});

// A row the customer hasn't typed into yet — skipped on submit, and not
// shown as invalid while they're still filling in the list.
const DEFAULTED = new Set(['package_type', 'quantity', 'fragile', 'payment_method']);
const isBlank = (row: BulkListRow) =>
  BULK_COLUMNS.every((column) => DEFAULTED.has(column) || row.record[column].trim() === '');

// Rows without their own pickup use the list's default pickup, so their
// pickup columns are cleared before the defaults are applied.
const effectiveRecord = (row: BulkListRow): BulkRecord =>
  row.customPickup
    ? row.record
    : { ...row.record, ...Object.fromEntries(PICKUP_COLUMNS.map((column) => [column, ''])) };

export const useBulkListForm = () => {
  const router = useRouter();
  const [details, setDetails] = useState<BulkListDetails>({ name: '', pickupDate: '', notes: '', businessAccountId: '' });
  const [pickup, setPickup] = useState<PickupDefaults>({
    pickup_address: '',
    pickup_contact_name: '',
    pickup_contact_phone: '',
  });
  const [rows, setRows] = useState<BulkListRow[]>(() => [newRow()]);
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // One id per submission attempt, reused on retries (migration 0020).
  const [clientRequestId] = useState(() => crypto.randomUUID());

  const validations = useMemo(() => {
    const results = validateBulkRecords(applyPickupDefaults(rows.map(effectiveRecord), pickup));
    return Object.fromEntries(rows.map((row, index) => [row.key, results[index]?.error ?? null]));
  }, [rows, pickup]);

  const filledRows = rows.filter((row) => !isBlank(row));
  const validCount = filledRows.filter((row) => !validations[row.key]).length;

  const rowError = (row: BulkListRow) => (attempted || !isBlank(row) ? validations[row.key] : null);

  const updateDetails = (field: keyof BulkListDetails, value: string) =>
    setDetails((current) => ({ ...current, [field]: value }));

  const updatePickup = (field: keyof PickupDefaults, value: string) =>
    setPickup((current) => ({ ...current, [field]: value }));

  const updateRow = (key: string, column: keyof BulkRecord, value: string) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, record: { ...row.record, [column]: value } } : row)),
    );

  const toggleCustomPickup = (key: string) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, customPickup: !row.customPickup } : row)));

  const addRow = () => setRows((current) => (current.length >= BULK_MAX_ROWS ? current : [...current, newRow()]));

  const duplicateRow = (key: string) =>
    setRows((current) => {
      if (current.length >= BULK_MAX_ROWS) return current;
      const index = current.findIndex((row) => row.key === key);
      if (index === -1) return current;
      const copy = newRow({ ...current[index].record }, current[index].customPickup);
      return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });

  const removeRow = (key: string) =>
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      return next.length === 0 ? [newRow()] : next;
    });

  const importCsv = async (file: File) => {
    setImportMessage(null);
    if (!file.name.toLowerCase().endsWith('.csv')) return setImportMessage({ ok: false, text: 'Choose a .csv file' });
    if (file.size > MAX_FILE_BYTES) return setImportMessage({ ok: false, text: 'File is too large (max 500 KB)' });

    const { headers, records } = parseCsvWithHeaders(await file.text());
    const missing = missingCustomerBulkColumns(headers);
    if (missing.length > 0) return setImportMessage({ ok: false, text: `Missing columns: ${missing.join(', ')}` });
    if (records.length === 0) return setImportMessage({ ok: false, text: 'The file has no shipment rows' });

    const kept = rows.filter((row) => !isBlank(row));
    const room = BULK_MAX_ROWS - kept.length;
    if (room <= 0) return setImportMessage({ ok: false, text: `The list already has ${BULK_MAX_ROWS} shipments` });

    const imported = records.slice(0, room).map((record) => {
      const base = newRecord();
      const merged = Object.fromEntries(
        BULK_COLUMNS.map((column) => [column, (record[column] ?? '').trim() || base[column]]),
      ) as BulkRecord;
      return newRow(merged, PICKUP_COLUMNS.some((column) => merged[column] !== ''));
    });

    setRows([...kept, ...imported]);
    setImportMessage({
      ok: records.length <= room,
      text:
        records.length <= room
          ? `Imported ${imported.length} shipments from ${file.name}. Review them below before submitting.`
          : `Imported the first ${imported.length} of ${records.length} rows — a list holds at most ${BULK_MAX_ROWS}.`,
    });
  };

  const submit = async () => {
    setAttempted(true);
    setSubmitError(null);

    const parsedDetails = bulkBatchDetailsSchema.safeParse({
      ...details,
      businessAccountId: details.businessAccountId || null,
      clientRequestId,
    });
    if (!parsedDetails.success) return setSubmitError(parsedDetails.error.issues[0]?.message ?? 'Check the list details');
    if (filledRows.length === 0) return setSubmitError('Add at least one shipment to the list');
    if (validCount === 0) return setSubmitError('None of the shipments are complete yet — fix the highlighted rows');

    setIsSubmitting(true);
    const result = await submitBulkBatchAction({
      details: parsedDetails.data,
      pickup,
      rows: filledRows.map(effectiveRecord),
    });

    if (!result.success) {
      setIsSubmitting(false);
      setSubmitError(result.error);
      return;
    }
    router.push(`/dashboard/customer/bulk/${result.batchId}`);
  };

  return {
    details,
    pickup,
    rows,
    validCount,
    filledCount: filledRows.length,
    rowError,
    importMessage,
    submitError,
    isSubmitting,
    updateDetails,
    updatePickup,
    updateRow,
    toggleCustomPickup,
    addRow,
    duplicateRow,
    removeRow,
    importCsv,
    submit,
  };
};
