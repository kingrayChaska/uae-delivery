'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import FieldError from '@/components/ui/field-error';
import { BULK_COLUMNS, BULK_MAX_ROWS } from '@/lib/business/schemas';
import { useBulkUpload } from '@/lib/hooks/use-bulk-upload';
import { useMessage } from '@/i18n/hooks';

type BulkUploadProps = {
  businessId: string;
  members: { id: string; fullName: string }[];
};

const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(
  `${BULK_COLUMNS.join(',')}\nDubai Marina Mall,Ali Hassan,0501234567,Mall of the Emirates,Sara Ahmed,0507654321,parcel,Shoes,1,1.2,no,cod\n`,
)}`;

const BulkUpload = ({ businessId, members }: BulkUploadProps) => {
  const t = useTranslations('manager.bulk');
  const translate = useMessage();
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? '');
  const { selectFile, upload, fileName, preview, validCount, fileError, results, summary, isUploading } =
    useBulkUpload(businessId);

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('addMembersFirst')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t('intro', { max: BULK_MAX_ROWS })}{' '}
        <a href={TEMPLATE_HREF} download="bulk-shipments-template.csv" className="underline">
          {t('template')}
        </a>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="owner">{t('owner')}</Label>
          <Select id="owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="csv">{t('file')}</Label>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) selectFile(file);
            }}
            className="text-sm text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>
      </div>

      <FieldError message={fileError ?? undefined} />

      {preview.length > 0 && !results ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {t.rich('preview', {
              file: fileName ?? '',
              valid: validCount,
              total: preview.length,
              strong: (chunks) => <span className="font-medium">{chunks}</span>,
            })}
            {validCount < preview.length ? t('previewSkipped') : '.'}
          </p>
          <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
            <table className="w-full">
              <tbody>
                {preview.map((row) => (
                  <tr key={row.rowNumber} className="border-t first:border-t-0">
                    <td className="px-3 py-1.5 font-brand-mono text-xs whitespace-nowrap text-muted-foreground">
                      {t('row', { number: row.rowNumber })}
                    </td>
                    <td className="px-3 py-1.5">
                      {row.row ? (
                        <>
                          {row.row.pickup_address} <span className="inline-block rtl:rotate-180">→</span> {row.row.dropoff_address}
                        </>
                      ) : null}
                    </td>
                    <td className={`px-3 py-1.5 text-xs ${row.error ? 'text-destructive' : 'text-success'}`}>
                      {row.error ? translate(row.error) : t('ok')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" className="self-start" disabled={isUploading || validCount === 0} onClick={() => upload(ownerId)}>
            {isUploading ? t('creating', { count: validCount }) : t('create', { count: validCount })}
          </Button>
        </div>
      ) : null}

      {results ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{translate(summary)}</p>
          <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
            <table className="w-full">
              <tbody>
                {results.map((row) => (
                  <tr key={row.rowNumber} className="border-t first:border-t-0">
                    <td className="px-3 py-1.5 font-brand-mono text-xs whitespace-nowrap text-muted-foreground">
                      {t('row', { number: row.rowNumber })}
                    </td>
                    <td className={`px-3 py-1.5 ${row.ok ? '' : 'text-destructive'}`}>{translate(row.message)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BulkUpload;
