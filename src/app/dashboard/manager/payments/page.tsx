import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import Pagination from '@/components/dashboard/pagination';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { listAllPayments } from '@/services/payments/list-all-payments';
import { COD_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/lib/types';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';
import type { PageSearchParams } from '@/lib/pagination';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('manager.payments'))('meta'),
});

const ManagerPaymentsPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('manager');
  const [payments, t, tShipments, format] = await Promise.all([
    listAllPayments(parsePage((await searchParams).page)),
    getTranslations('manager.payments'),
    getTranslations('shipments'),
    getFormat(),
  ]);
  // Card payments carry a payment status; cash rows carry a COD status.
  const statusLabel = (status: string) =>
    (PAYMENT_STATUSES as readonly string[]).includes(status)
      ? tShipments(`paymentStatus.${status as (typeof PAYMENT_STATUSES)[number]}`)
      : (COD_STATUSES as readonly string[]).includes(status)
        ? tShipments(`codStatus.${status as (typeof COD_STATUSES)[number]}`)
        : status;
  const methodLabel = (method: string) =>
    (PAYMENT_METHODS as readonly string[]).includes(method)
      ? tShipments(`paymentMethod.${method as (typeof PAYMENT_METHODS)[number]}`)
      : method;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('subtitle')}</p>

      {payments.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('columns.shipment')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.customer')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.method')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.amount')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.status')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.date')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.items.map((payment) => (
                <tr key={`${payment.method}-${payment.id}`} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/manager/shipments/${payment.shipmentId}`}
                      dir="ltr"
                      className="font-brand-mono text-xs hover:underline"
                    >
                      {payment.trackingNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{payment.customerName}</td>
                  <td className="px-3 py-2 text-xs">{methodLabel(payment.method)}</td>
                  <td className="px-3 py-2 font-brand-mono whitespace-nowrap">{format.money(payment.amount, payment.currency)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{statusLabel(payment.status)}</Badge>
                  </td>
                  <td className="px-3 py-2 font-brand-mono text-xs whitespace-nowrap text-muted-foreground">
                    {format.date(payment.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={payments.page} totalPages={payments.totalPages} href="/dashboard/manager/payments" />
    </main>
  );
};

export default ManagerPaymentsPage;
