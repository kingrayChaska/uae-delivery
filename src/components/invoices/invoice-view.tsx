import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleAlert, CircleCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import InvoiceDocument from '@/components/invoices/invoice-document';
import PrintButton from '@/components/shipment/label/print-button';
import { getInvoiceByNumber } from '@/services/invoices/get-invoice';

type InvoiceViewProps = {
  invoiceNumber: string;
  // Just generated: say so, and how to download it.
  issued: boolean;
  // Where this dashboard opens a shipment / a bulk shipment.
  shipmentHref: (id: string) => string;
  batchHref: (id: string) => string;
};

// One invoice page for every role. Who may open it is decided by RLS
// (invoices_select): another customer's or merchant's invoice is simply
// not found.
const InvoiceView = async ({ invoiceNumber, issued, shipmentHref, batchHref }: InvoiceViewProps) => {
  const t = await getTranslations('invoices');
  const invoice = await getInvoiceByNumber(invoiceNumber).catch((error: unknown) => {
    console.error('Invoice could not be loaded', error instanceof Error ? error.message : error);
    return undefined;
  });
  if (invoice === null) notFound();

  if (invoice === undefined) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {t('errors.loadFailed')}
          </p>
        </div>
      </main>
    );
  }

  const back = invoice.batchId
    ? { href: batchHref(invoice.batchId), label: t('actions.openBulk') }
    : invoice.shipmentId
      ? { href: shipmentHref(invoice.shipmentId), label: t('actions.openShipment') }
      : null;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {back ? (
          <Link href={back.href} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {back.label}
          </Link>
        ) : (
          <span />
        )}
        <PrintButton label={t('actions.print')} />
      </div>

      {issued ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/50 bg-success/10 p-4 text-sm print:hidden">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            <span className="font-medium">{t('generated')}</span> {t('printHint')}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground print:hidden">{t('printHint')}</p>
      )}

      <div className="min-w-0">
        <InvoiceDocument invoice={invoice} />
      </div>
    </main>
  );
};

export default InvoiceView;
