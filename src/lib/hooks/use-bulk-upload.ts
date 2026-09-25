'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { bulkCreateShipmentsAction } from '@/lib/business/actions';
import { parseCsvWithHeaders } from '@/lib/csv/parse';
import { BULK_MAX_ROWS, missingBulkColumns, validateBulkRecords } from '@/lib/business/schemas';

import type { BulkRowResult } from '@/lib/business/actions';
import type { BulkRowValidation } from '@/lib/business/schemas';

const MAX_FILE_BYTES = 500_000;

// Two steps: an instant in-browser preview (same zod schema the server
// uses, zero API calls), then the real upload — which the server
// re-parses and re-validates from scratch.
export const useBulkUpload = (businessId: string) => {
  const router = useRouter();
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkRowValidation[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkRowResult[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const selectFile = async (file: File) => {
    setResults(null);
    setSummary(null);
    setFileError(null);
    setPreview([]);
    setCsvText(null);

    if (!file.name.toLowerCase().endsWith('.csv')) return setFileError('Choose a .csv file');
    if (file.size > MAX_FILE_BYTES) return setFileError('File is too large (max 500 KB)');

    const text = await file.text();
    const { headers, records } = parseCsvWithHeaders(text);
    const missing = missingBulkColumns(headers);
    if (missing.length > 0) return setFileError(`Missing columns: ${missing.join(', ')}`);
    if (records.length === 0) return setFileError('The file has no shipment rows');
    if (records.length > BULK_MAX_ROWS) {
      return setFileError(`Upload at most ${BULK_MAX_ROWS} rows at a time (this file has ${records.length})`);
    }

    setFileName(file.name);
    setCsvText(text);
    setPreview(validateBulkRecords(records));
  };

  const upload = async (ownerProfileId: string) => {
    if (!csvText) return;
    setIsUploading(true);
    setFileError(null);
    const result = await bulkCreateShipmentsAction(businessId, ownerProfileId, csvText);
    setIsUploading(false);

    if (!result.success) {
      setFileError(result.error);
      return;
    }
    setResults(result.rows);
    setSummary(`${result.created} created, ${result.failed} failed`);
    router.refresh();
  };

  const validCount = preview.filter((row) => !row.error).length;

  return { selectFile, upload, fileName, preview, validCount, fileError, results, summary, isUploading };
};
