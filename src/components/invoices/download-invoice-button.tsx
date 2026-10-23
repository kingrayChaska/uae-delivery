'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import { issueShipmentInvoiceAction } from '@/lib/invoices/actions';
import { useMessage } from '@/i18n/hooks';

const pdfHref = (invoiceNumber: string) => `/api/invoices/${invoiceNumber}/pdf`;

// "Download invoice" for one shipment. With an invoice already issued it is
// a plain link to the PDF. Without one (a guest booking, migration 0054) it
// first asks the server to issue it — from the stored shipment data; a
// repeat returns the same invoice — then downloads it.
const DownloadInvoiceButton = ({ shipmentId, invoiceNumber }: { shipmentId: string; invoiceNumber: string | null }) => {
  const t = useTranslations('invoices');
  const translate = useMessage();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<string | null>(null);

  if (invoiceNumber) {
    return (
      <Button asChild variant="outline" size="sm">
        <a href={pdfHref(invoiceNumber)} download={`${invoiceNumber}.pdf`}>
          <Download aria-hidden />
          {t('actions.downloadInvoice')}
        </a>
      </Button>
    );
  }

  const issueAndDownload = async () => {
    setIsPending(true);
    setError(null);
    const result = await issueShipmentInvoiceAction(shipmentId).catch(() => ({ success: false as const, error: 'invoices.errors.generateFailed' }));
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setReady(result.invoiceNumber);
    // An attachment: the browser downloads it and stays on this page.
    window.location.assign(pdfHref(result.invoiceNumber));
    router.refresh();
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={issueAndDownload} loading={isPending} loadingText={t('actions.preparing')}>
        <Download aria-hidden />
        {t('actions.downloadInvoice')}
      </Button>
      {error ? (
        <p role="alert" className="max-w-xs text-xs font-medium text-destructive">
          {translate(error)}
        </p>
      ) : null}
      {ready ? (
        <p role="status" className="max-w-xs text-xs text-muted-foreground">
          {t('downloadStarted', { number: ready })}
        </p>
      ) : null}
    </div>
  );
};

export default DownloadInvoiceButton;
