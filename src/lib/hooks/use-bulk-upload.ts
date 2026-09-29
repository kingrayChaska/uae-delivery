'use client';

import { useState } from 'react';

import { msg } from '@/i18n/message';
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

    if (!file.name.toLowerCase().endsWith('.csv')) return setFileError('manager.bulk.errors.notCsv');
    if (file.size > MAX_FILE_BYTES) return setFileError('manager.bulk.errors.tooLarge');

    const text = await file.text();
    const { headers, records } = parseCsvWithHeaders(text);
    const missing = missingBulkColumns(headers);
    if (missing.length > 0) return setFileError(msg('manager.bulk.errors.missingColumns', { columns: missing.join(', ') }));
    if (records.length === 0) return setFileError('manager.bulk.errors.empty');
    if (records.length > BULK_MAX_ROWS) {
      return setFileError(msg('manager.bulk.errors.tooMany', { max: BULK_MAX_ROWS, count: records.length }));
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
    setSummary(msg('manager.bulk.summary', { created: result.created, total: result.created + result.failed }));
    router.refresh();
  };

  const validCount = preview.filter((row) => !row.error).length;

  return { selectFile, upload, fileName, preview, validCount, fileError, results, summary, isUploading };
};
