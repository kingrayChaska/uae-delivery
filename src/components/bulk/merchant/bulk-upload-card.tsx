'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, CalendarClock, Download, FileSpreadsheet, MapPin, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import FieldError from '@/components/ui/field-error';
import { createBulkDraftAction } from '@/lib/bulk/merchant-actions';
import { parseCsvRecords } from '@/lib/csv/parse';
import {
  MERCHANT_BULK_COLUMNS,
  MERCHANT_BULK_MAX_FILE_BYTES,
  MERCHANT_BULK_MAX_ROWS,
  PICKUP_ADDRESS_MAX,
  PICKUP_ADDRESS_MIN,
  merchantTemplateCsv,
  readMerchantTable,
} from '@/lib/bulk/merchant-csv';
import { XLSX_MIME, merchantTemplateXlsx } from '@/lib/bulk/merchant-template-xlsx';
import { cn } from '@/lib/utils';
import { useFormat } from '@/i18n/hooks';

const download = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

// Stage 1: the batch's pickup address (once, for every shipment), the
// template, and the CSV. The browser only checks what it can instantly
// (pickup filled in, type, size, columns, row count); the server parses and
// validates everything again from scratch.
const BulkUploadCard = ({ today, defaultPickupAddress }: { today: string; defaultPickupAddress: string }) => {
  const t = useTranslations('bulk.upload');
  const format = useFormat();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickupAddress, setPickupAddress] = useState(defaultPickupAddress);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setPickupError(null);
    const pickup = pickupAddress.trim();
    if (pickup.length < PICKUP_ADDRESS_MIN) return setPickupError('bulk.errors.pickupRequired');
    if (!file.name.toLowerCase().endsWith('.csv')) return setError('bulk.errors.notCsv');
    if (file.size > MERCHANT_BULK_MAX_FILE_BYTES) return setError('bulk.errors.tooLarge');

    const text = await file.text();
    const table = readMerchantTable(parseCsvRecords(text));
    if ('error' in table) return setError(table.error);

    setUploading(file.name);
    const result = await createBulkDraftAction(file.name, text, pickup);
    if (!result.success) {
      setUploading(null);
      // Problems with the pickup address belong next to its field.
      if (/^(bulk\.errors\.pickup|serviceAreas\.errors\.pickup)/.test(result.error)) setPickupError(result.error);
      else setError(result.error);
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
      <CardContent className="flex flex-col gap-6 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold">{t('title')}</h2>
            <p className="text-sm text-muted-foreground">{t('body')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => download(new Blob([merchantTemplateXlsx(today) as BlobPart], { type: XLSX_MIME }), 'parcellink-bulk-shipments-template.xlsx')}
            >
              <FileSpreadsheet aria-hidden />
              {t('templateExcel')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => download(new Blob([merchantTemplateCsv(today)], { type: 'text/csv;charset=utf-8' }), 'parcellink-bulk-shipments-template.csv')}
            >
              <Download aria-hidden />
              {t('template')}
            </Button>
          </div>
        </div>

        {/* 1 — Pickup address, once for the whole batch */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-pickup" className="flex items-center gap-1.5">
            <MapPin className="size-4 text-primary" aria-hidden />
            {t('pickupLabel')}
            <span aria-hidden> *</span>
          </Label>
          <Input
            id="bulk-pickup"
            value={pickupAddress}
            maxLength={PICKUP_ADDRESS_MAX}
            autoComplete="street-address"
            placeholder={t('pickupPlaceholder')}
            disabled={uploading !== null}
            aria-invalid={pickupError ? true : undefined}
            aria-describedby="bulk-pickup-help"
            onChange={(event) => {
              setPickupAddress(event.target.value);
              setPickupError(null);
            }}
          />
          <p id="bulk-pickup-help" className="text-sm text-muted-foreground">
            {t('pickupHelp')}
          </p>
          <FieldError message={pickupError} />
        </div>

        {/* Set by ParcelLink for every shipment */}
        <ul className="flex flex-wrap gap-2 text-sm">
          <li className="flex items-center gap-1.5 rounded-full border bg-secondary/40 px-3 py-1">
            <CalendarClock className="size-4 text-primary" aria-hidden />
            {t('fixedNextDay')}
          </li>
          <li className="flex items-center gap-1.5 rounded-full border bg-secondary/40 px-3 py-1">
            <Banknote className="size-4 text-primary" aria-hidden />
            {t('fixedCod')}
          </li>
        </ul>

        {/* 2 — The CSV */}
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
            <li>
              {t('formatRequired')}{' '}
              <span dir="ltr" className="font-brand-mono text-xs">
                {MERCHANT_BULK_COLUMNS.join(',')}
              </span>
            </li>
            <li>{t('formatDate')}</li>
            <li>{t('formatCod')}</li>
            <li>{t('formatPhone')}</li>
            <li>{t('formatAddresses')}</li>
            <li>{t('formatNotNeeded')}</li>
            <li>{t('formatExcel')}</li>
          </ul>
        </details>
      </CardContent>
    </Card>
  );
};

export default BulkUploadCard;
