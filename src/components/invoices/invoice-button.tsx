'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import { issueBatchInvoiceAction, issueShipmentInvoiceAction } from '@/lib/invoices/actions';
import { useMessage } from '@/i18n/hooks';

type InvoiceButtonProps = {
  // What to invoice: one shipment, or a merchant's whole bulk shipment.
  subject: { shipmentId: string } | { batchId: string };
  // The invoice already issued for it, if any.
  invoiceNumber: string | null;
  // Where invoice pages live for this dashboard, e.g. /dashboard/customer/invoices.
  invoiceBasePath: string;
};

// "View invoice" when one exists, else "Generate invoice": the server issues
// it from the stored shipment data and this opens it.
const InvoiceButton = ({ subject, invoiceNumber, invoiceBasePath }: InvoiceButtonProps) => {
  const t = useTranslations('invoices.actions');
  const translate = useMessage();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bulk = 'batchId' in subject;

  if (invoiceNumber) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`${invoiceBasePath}/${invoiceNumber}`}>
          <FileText aria-hidden />
          {bulk ? t('viewBulk') : t('view')}
        </Link>
      </Button>
    );
  }

  const generate = async () => {
    setIsPending(true);
    setError(null);
    const result = 'batchId' in subject ? await issueBatchInvoiceAction(subject.batchId) : await issueShipmentInvoiceAction(subject.shipmentId);
    if (!result.success) {
      setIsPending(false);
      setError(result.error);
      return;
    }
    // Stays "pending" until the invoice page replaces this one.
    router.push(`${invoiceBasePath}/${result.invoiceNumber}?issued=1`);
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={generate} loading={isPending} loadingText={bulk ? t('generateBulk') : t('generate')}>
        <FileText aria-hidden />
        {bulk ? t('generateBulk') : t('generate')}
      </Button>
      {error ? (
        <p role="alert" className="max-w-xs text-xs font-medium text-destructive">
          {translate(error)}
        </p>
      ) : null}
    </div>
  );
};

export default InvoiceButton;
