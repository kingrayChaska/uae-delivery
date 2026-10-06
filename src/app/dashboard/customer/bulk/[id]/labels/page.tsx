import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CircleAlert, RotateCcw } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import ShipmentLabel from '@/components/shipment/label/shipment-label';
import BulkLabelDownload from '@/components/shipment/label/bulk-label-download';
import ToastOnMount from '@/components/ui/toast-on-mount';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { isUuid } from '@/lib/security/validate';
import { parsePage } from '@/lib/pagination';
import { getBatchLabels } from '@/services/qr/get-shipment-label-data';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('bulk.labels'))('meta'),
});

// Every label of one bulk shipment, downloaded as one PDF file (one A5
// label per page, in the batch page's order). The labels are the existing
// ShipmentLabel, rendered here by the server from the database; the
// browser turns them into the PDF (BulkLabelDownload). They can also be
// printed directly. A batch of more than LABELS_PER_PART comes in parts.
const SHEET_ID = 'bulk-label-sheet';

const BulkLabelsPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ part?: string | string[]; download?: string }>;
}) => {
  const profile = await requireRoleOrRedirect('customer');
  if (profile.accountType !== 'merchant') redirect('/dashboard/customer/merchant');
  const [{ id }, query, t] = await Promise.all([params, searchParams, getTranslations('bulk.labels')]);
  if (!isUuid(id)) notFound();

  // Null unless this merchant booked the batch.
  const result = await getBatchLabels(id, profile.id, parsePage(query.part));
  if (!result) notFound();

  const batchHref = `/dashboard/customer/bulk/${id}`;
  const partHref = (part: number) => `${batchHref}/labels?part=${part}`;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 print:p-0">
      <div className="flex w-full max-w-2xl flex-col gap-4 print:hidden">
        <Link href={batchHref} className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground hover:underline">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('back')}
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground rtl:text-right">
            {result.reference}
          </p>
        </div>

        {result.status === 'empty' ? (
          <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
            {t('empty')}
          </p>
        ) : null}

        {result.status === 'incomplete' ? <ToastOnMount type="error" message={t('failed')} /> : null}
        {result.status === 'incomplete' ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-destructive/50 bg-destructive/5 p-4 text-sm">
            <p className="flex items-start gap-2 font-medium text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('failed')}
            </p>
            {result.failed.length > 0 ? (
              <div>
                <p>{t('failedList', { count: result.failed.length })}</p>
                <ul dir="ltr" className="mt-1 flex flex-wrap gap-2 font-brand-mono rtl:justify-end">
                  {result.failed.map((code) => (
                    <li key={code} className="rounded-md bg-background px-2 py-0.5 ring-1 ring-border">
                      {code}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link href={`${batchHref}/labels${query.part ? `?part=${parsePage(query.part)}` : ''}`}>
                <RotateCcw aria-hidden />
                {t('retry')}
              </Link>
            </Button>
          </div>
        ) : null}

        {result.status === 'ready' ? (
          <>
            {result.parts > 1 ? (
              <nav aria-label={t('partsLabel')} className="flex flex-col gap-2 rounded-2xl border bg-secondary/40 p-4 text-sm">
                <p>
                  {t('partOf', {
                    first: result.first,
                    last: result.first + result.labels.length - 1,
                    total: result.total,
                    part: result.part,
                    parts: result.parts,
                  })}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {Array.from({ length: result.parts }, (_, index) => index + 1).map((part) => (
                    <li key={part}>
                      <Link
                        href={partHref(part)}
                        aria-current={part === result.part ? 'page' : undefined}
                        className="inline-flex min-h-10 items-center rounded-lg border bg-background px-3 hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:border-primary aria-[current=page]:font-semibold"
                      >
                        {t('part', { part })}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            <BulkLabelDownload
              reference={result.reference}
              count={result.labels.length}
              part={result.part}
              parts={result.parts}
              autoStart={query.download === '1'}
              sheetId={SHEET_ID}
            />

            <section aria-labelledby="labels-included" className="flex flex-col gap-2">
              <h2 id="labels-included" className="font-medium">
                {t('included', { count: result.labels.length })}
              </h2>
              <ol className="divide-y overflow-hidden rounded-2xl border text-sm">
                {result.labels.map((label, index) => (
                  <li key={label.trackingNumber} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
                    <span className="w-8 shrink-0 font-brand-mono text-xs text-muted-foreground">{result.first + index}</span>
                    <span dir="ltr" className="font-brand-mono font-medium">
                      {label.trackingNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{label.dropoffContactName}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : null}
      </div>

      {/* The labels themselves, at one fixed width so every PDF page is laid
          out the same on any device. Off-screen and hidden from screen
          readers (the list above says what's included); printing shows
          them (globals.css). */}
      {result.status === 'ready' ? (
        <div id={SHEET_ID} data-print-labels aria-hidden className="pointer-events-none fixed top-0 left-[-10000px] w-[600px] bg-white">
          {result.labels.map((label) => (
            <ShipmentLabel key={label.trackingNumber} {...label} />
          ))}
        </div>
      ) : null}
    </main>
  );
};

export default BulkLabelsPage;
