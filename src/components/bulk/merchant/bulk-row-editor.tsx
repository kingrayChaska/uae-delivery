'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useMessage } from '@/i18n/hooks';
import { MAX_CELL_LENGTH, MERCHANT_BULK_COLUMNS, REQUIRED_MERCHANT_COLUMNS } from '@/lib/bulk/merchant-csv';

import type { MerchantRowInput } from '@/lib/bulk/merchant-csv';
import type { BulkReviewRow } from '@/services/bulk/merchant-bulk';

type BulkRowEditorProps = {
  row: BulkReviewRow;
  onSave: (rowId: string, input: MerchantRowInput) => Promise<string | null>;
};

// Fix one row in place: the same columns as the CSV, each with the
// problems found in it. Saving re-checks just this row on the server
// (address, coverage, route and price) — no re-upload.
const BulkRowEditor = ({ row, onSave }: BulkRowEditorProps) => {
  const t = useTranslations('bulk');
  const translate = useMessage();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<MerchantRowInput>(row.input);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issuesFor = (column: string) => row.issues.filter((issue) => issue.field === column);
  const otherIssues = row.issues.filter((issue) => !(MERCHANT_BULK_COLUMNS as readonly string[]).includes(issue.field));

  const save = async () => {
    setSaving(true);
    setError(null);
    const failure = await onSave(row.id, values);
    setSaving(false);
    if (failure) setError(failure);
    else setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (next) {
          setValues(row.input);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={t('review.editRow', { number: row.rowNumber })}>
          <Pencil aria-hidden />
          <span className="sr-only sm:not-sr-only">{t('review.edit')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('review.editTitle', { number: row.rowNumber })}</DialogTitle>
          <DialogDescription>{t('review.editBody')}</DialogDescription>
        </DialogHeader>

        {otherIssues.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            {otherIssues.map((issue, index) => (
              <div key={index} className="text-sm">
                <span className="font-medium">{t(`fields.${issue.field}`)}: </span>
                <FieldError message={issue.message} />
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {MERCHANT_BULK_COLUMNS.map((column) => {
            const issues = issuesFor(column);
            const id = `bulk-${row.id}-${column}`;
            const wide = column.endsWith('_address') || column === 'notes' || column === 'package_description';
            return (
              <div key={column} className={`flex flex-col gap-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
                <Label htmlFor={id}>
                  {t(`fields.${column}`)}
                  {REQUIRED_MERCHANT_COLUMNS.includes(column) ? <span aria-hidden> *</span> : null}
                  <span dir="ltr" className="ms-2 font-brand-mono text-xs font-normal text-muted-foreground">
                    {column}
                  </span>
                </Label>
                <Input
                  id={id}
                  value={values[column]}
                  maxLength={MAX_CELL_LENGTH}
                  type={column === 'delivery_date' ? 'date' : 'text'}
                  inputMode={['quantity', 'weight_kg', 'package_value', 'cod_amount'].includes(column) ? 'decimal' : undefined}
                  aria-invalid={issues.some((issue) => issue.severity === 'error') || undefined}
                  onChange={(event) => setValues((current) => ({ ...current, [column]: event.target.value }))}
                />
                {issues.map((issue, index) =>
                  issue.severity === 'error' ? (
                    <FieldError key={index} message={issue.message} />
                  ) : (
                    <p key={index} className="rounded-md bg-warning/15 px-2 py-1 text-sm">
                      {translate(issue.message)}
                    </p>
                  ),
                )}
              </div>
            );
          })}
        </div>

        <FieldError message={error} />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={saving}>
              {t('review.cancelEdit')}
            </Button>
          </DialogClose>
          <Button type="button" onClick={save} loading={saving} loadingText={t('review.rechecking')}>
            {t('review.saveRecheck')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkRowEditor;
