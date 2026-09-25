'use client';

import { useState } from 'react';

import Button from '@/components/ui/button';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import FieldError from '@/components/ui/field-error';
import { BULK_COLUMNS, BULK_MAX_ROWS } from '@/lib/business/schemas';
import { useBulkUpload } from '@/lib/hooks/use-bulk-upload';

type BulkUploadProps = {
  businessId: string;
  members: { id: string; fullName: string }[];
};

const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(
  `${BULK_COLUMNS.join(',')}\nDubai Marina Mall,Ali Hassan,0501234567,Mall of the Emirates,Sara Ahmed,0507654321,parcel,Shoes,1,1.2,no,cod\n`,
)}`;

const BulkUpload = ({ businessId, members }: BulkUploadProps) => {
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? '');
  const { selectFile, upload, fileName, preview, validCount, fileError, results, summary, isUploading } =
    useBulkUpload(businessId);

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">Add at least one member before uploading shipments.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Up to {BULK_MAX_ROWS} shipments per file. Addresses are geocoded and every shipment is priced server-side
        with the active pricing rule.{' '}
        <a href={TEMPLATE_HREF} download="bulk-shipments-template.csv" className="underline">
          Download template
        </a>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="owner">Book shipments as</Label>
          <Select id="owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="csv">CSV file</Label>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) selectFile(file);
            }}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>
      </div>

      <FieldError message={fileError ?? undefined} />

      {preview.length > 0 && !results ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="font-medium">{fileName}</span> — {validCount} of {preview.length} rows valid
            {validCount < preview.length ? '; invalid rows will be skipped.' : '.'}
          </p>
          <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
            <table className="w-full">
              <tbody>
                {preview.map((row) => (
                  <tr key={row.rowNumber} className="border-t first:border-t-0">
                    <td className="px-3 py-1.5 font-brand-mono text-xs text-muted-foreground">Row {row.rowNumber}</td>
                    <td className="px-3 py-1.5">
                      {row.row ? `${row.row.pickup_address} → ${row.row.dropoff_address}` : null}
                    </td>
                    <td className={`px-3 py-1.5 text-xs ${row.error ? 'text-destructive' : 'text-success'}`}>
                      {row.error ?? 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" className="self-start" disabled={isUploading || validCount === 0} onClick={() => upload(ownerId)}>
            {isUploading ? `Creating ${validCount} shipments…` : `Create ${validCount} shipments`}
          </Button>
        </div>
      ) : null}

      {results ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{summary}</p>
          <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
            <table className="w-full">
              <tbody>
                {results.map((row) => (
                  <tr key={row.rowNumber} className="border-t first:border-t-0">
                    <td className="px-3 py-1.5 font-brand-mono text-xs text-muted-foreground">Row {row.rowNumber}</td>
                    <td className={`px-3 py-1.5 ${row.ok ? '' : 'text-destructive'}`}>{row.message}</td>
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
