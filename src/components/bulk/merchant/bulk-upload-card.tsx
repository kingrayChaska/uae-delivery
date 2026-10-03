'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import FieldError from '@/components/ui/field-error';
import { createBulkDraftAction } from '@/lib/bulk/merchant-actions';
import { parseCsvWithHeaders } from '@/lib/csv/parse';
import {
  MERCHANT_BULK_MAX_FILE_BYTES,
  MERCHANT_BULK_MAX_ROWS,
  REQUIRED_MERCHANT_COLUMNS,
  merchantTemplateCsv,
  missingMerchantColumns,
} from '@/lib/bulk/merchant-csv';
import { cn } from '@/lib/utils';
import { useFormat } from '@/i18n/hooks';

import { msg } from '@/i18n/message';

// Stage 1: download the template, drop in a CSV. The browser only checks
// what it can instantly (type, size, headers, row count); the server parses
// and validates the file again from scratch.
const BulkUploadCard = ({ today }: { today: string }) => {
  const t = useTranslations('bulk.upload');
  const format = useFormat();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([merchantTemplateCsv(today)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'parcellink-bulk-shipments-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) return setError('bulk.errors.notCsv');
    if (file.size > MERCHANT_BULK_MAX_FILE_BYTES) return setError('bulk.errors.tooLarge');

    const text = await file.text();
    const { headers, records } = parseCsvWithHeaders(text);
    const missing = missingMerchantColumns(headers);
    if (headers.length === 0 || records.length === 0) return setError('bulk.errors.empty');
    if (missing.length > 0) return setError(msg('bulk.errors.missingColumns', { columns: missing.join(', ') }));
    if (records.length > MERCHANT_BULK_MAX_ROWS) {
      return setError(msg('bulk.errors.tooMany', { max: MERCHANT_BULK_MAX_ROWS, count: records.length }));
    }

    setUploading(file.name);
    const result = await createBulkDraftAction(file.name, text);
    if (!result.success) {
      setUploading(null);
      setError(result.error);
      return;
    }
    router.push(`/dashboard/customer/bulk/${result.batchId}`);
  };

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !uploading) void upload(file);
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold">{t('title')}</h2>
            <p className="text-sm text-muted-foreground">{t('body')}</p>
          </div>
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <Download aria-hidden />
            {t('template')}
          </Button>
        </div>

        <label
          htmlFor="bulk-csv"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onFiles(event.dataTransfer.files);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
            'focus-within:ring-2 focus-within:ring-ring',
            dragging ? 'border-primary bg-secondary/60' : 'hover:border-primary/50 hover:bg-secondary/30',
            uploading && 'pointer-events-none opacity-70',
          )}
        >
          {uploading ? (
            <FileSpreadsheet className="size-8 animate-pulse text-primary motion-reduce:animate-none" aria-hidden />
          ) : (
            <Upload className="size-8 text-primary" aria-hidden />
          )}
          <span className="font-medium">{uploading ? t('uploading', { file: uploading }) : t('drop')}</span>
          <span className="text-sm text-muted-foreground">
            {t('limits', { size: format.number(Math.floor(MERCHANT_BULK_MAX_FILE_BYTES / 1000)), rows: format.number(MERCHANT_BULK_MAX_ROWS) })}
          </span>
          <input
            ref={inputRef}
            id="bulk-csv"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={uploading !== null}
            onChange={(event) => {
              onFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </label>

        <FieldError message={error} />

        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t('formatTitle')}</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-muted-foreground">
            <li>{t('formatRequired', { columns: REQUIRED_MERCHANT_COLUMNS.join(', ') })}</li>
            <li>{t('formatDate')}</li>
            <li>{t('formatCod')}</li>
            <li>{t('formatPhone')}</li>
            <li>{t('formatOptional')}</li>
            <li>{t('formatAddresses')}</li>
          </ul>
        </details>
      </CardContent>
    </Card>
  );
};

export default BulkUploadCard;
