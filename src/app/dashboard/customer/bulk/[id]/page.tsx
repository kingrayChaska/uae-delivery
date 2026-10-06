import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CircleCheck, Download, LoaderCircle, Tags } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import BatchDetail from '@/components/bulk/batch-detail';
import BulkReview from '@/components/bulk/merchant/bulk-review';
import RefreshWhile from '@/components/bulk/merchant/refresh-while';
import InvoiceButton from '@/components/invoices/invoice-button';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { isUuid } from '@/lib/security/validate';
import { parsePage } from '@/lib/pagination';
import { cardPaymentsLive } from '@/lib/payments';
import { PAYMENT_METHODS } from '@/lib/types';
import { getBatchDetail } from '@/services/bulk/list-batches';
import { getMerchantBatch, listBatchRows, reconcileStaleBooking } from '@/services/bulk/merchant-bulk';
import { getInvoiceNumberFor } from '@/services/invoices/get-invoice';

import type { Metadata } from 'next';

// Row checks and the booking run as server actions from this page.
export const maxDuration = 60;

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('bulk.page'))('metaBatch'),
});

const MerchantBatchPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[]; booked?: string }>;
}) => {
  const profile = await requireRoleOrRedirect('customer');
  if (profile.accountType !== 'merchant') redirect('/dashboard/customer/merchant');
  const [{ id }, query, t] = await Promise.all([params, searchParams, getTranslations('bulk')]);
  if (!isUuid(id)) notFound();

  let batch = await getMerchantBatch(id);
  if (!batch) notFound();
  // A booking interrupted part-way is finished or handed back here.
  if (batch.status === 'processing' && (await reconcileStaleBooking(profile.id, id))) batch = await getMerchantBatch(id);
  if (!batch) notFound();

  if (batch.status === 'draft') {
    const loadedAt = new Date().toISOString();
    const rows = await listBatchRows(id);
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <BulkReview
          batch={{
            id: batch.id,
            reference: batch.reference,
            name: batch.fileName ?? batch.name,
            pickupAddress: batch.pickupAddress,
            bookingError: batch.bookingError,
            uploaderName: batch.uploaderName,
          }}
          initialRows={rows}
          loadedAt={loadedAt}
          // Only the merchant who uploaded it can change or book it (the
          // server enforces this too); business colleagues can look.
          readOnly={batch.customerId !== profile.id}
          paymentMethods={cardPaymentsLive() ? [...PAYMENT_METHODS] : ['cod']}
        />
      </main>
    );
  }

  if (batch.status === 'processing' || batch.status === 'cancelled') {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <Card>
          <CardContent className="flex flex-col items-start gap-3 pt-6" role="status">
            <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground">
              {batch.reference}
            </p>
            {batch.status === 'processing' ? (
              <>
                <RefreshWhile />
                <h1 className="flex items-center gap-2 text-xl font-semibold">
                  <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
                  {t('state.bookingTitle')}
                </h1>
                <p className="text-muted-foreground">{t('state.bookingBody')}</p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-semibold">{t('state.cancelledTitle')}</h1>
                <p className="text-muted-foreground">{t('state.cancelledBody')}</p>
              </>
            )}
            <Button asChild variant="outline">
              <Link href="/dashboard/customer/bulk">{t('review.back')}</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const [detail, invoiceNumber] = await Promise.all([getBatchDetail(id, parsePage(query.page)), getInvoiceNumberFor({ batchId: id })]);
  if (!detail) notFound();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      {query.booked === '1' ? (
        <div role="status" className="mx-6 mt-6 flex items-start gap-3 rounded-2xl border border-success/50 bg-success/10 p-4 text-sm">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            <span className="font-medium">{t('state.bookedTitle', { count: detail.shipmentCount })}</span> {t('state.bookedBody')}
          </p>
        </div>
      ) : null}
      <BatchDetail
        batch={detail}
        backHref="/dashboard/customer/bulk"
        backLabel={t('review.back')}
        shipmentBasePath="/dashboard/customer/deliveries"
        pageHref={`/dashboard/customer/bulk/${id}`}
        actions={
          <>
            {/* One invoice for the whole bulk shipment (migration 0031). */}
            {invoiceNumber || detail.shipmentCount > 0 ? (
              <InvoiceButton subject={{ batchId: id }} invoiceNumber={invoiceNumber} invoiceBasePath="/dashboard/customer/invoices" />
            ) : null}
            {/* Every label in one PDF file. Only the merchant who booked
                it: QR codes are the booking customer's alone. */}
            {batch.customerId === profile.id && detail.shipmentCount > 0 ? (
              <Button asChild size="sm">
                <Link href={`/dashboard/customer/bulk/${id}/labels?download=1`}>
                  <Tags aria-hidden />
                  {t('labels.download', { count: detail.shipmentCount })}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href={`/api/merchant/bulk/${id}/report`} download>
                <Download aria-hidden />
                {t('state.report')}
              </a>
            </Button>
          </>
        }
      />
    </div>
  );
};

export default MerchantBatchPage;
