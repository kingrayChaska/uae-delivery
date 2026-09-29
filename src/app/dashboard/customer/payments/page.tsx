import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import Pagination from '@/components/dashboard/pagination';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { listCustomerPayments } from '@/services/shipments/list-payments';
import { getFormat } from '@/i18n/server';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@/lib/types';

import type { Metadata } from 'next';
import type { PageSearchParams } from '@/lib/pagination';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('customer.payments'))('meta'),
});

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'destructive'> = {
  paid: 'success',
  pending: 'secondary',
  failed: 'destructive',
  refunded: 'destructive',
};

const PaymentsPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  const profile = await requireRoleOrRedirect('customer');
  const [payments, t, tShipments, format] = await Promise.all([
    listCustomerPayments(profile.id, parsePage((await searchParams).page)),
    getTranslations('customer.payments'),
    getTranslations('shipments'),
    getFormat(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {payments.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.items.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div>
                  <Link
                    href={`/dashboard/customer/deliveries/${payment.shipmentId}`}
                    className="font-brand-mono text-sm text-muted-foreground hover:underline"
                    dir="ltr"
                  >
                    {payment.trackingNumber}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {(PAYMENT_METHODS as readonly string[]).includes(payment.method)
                      ? tShipments(`paymentMethod.${payment.method as (typeof PAYMENT_METHODS)[number]}`)
                      : payment.method}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-brand-mono text-sm">{format.money(payment.amount, payment.currency)}</span>
                  <Badge variant={STATUS_VARIANT[payment.status] ?? 'default'}>
                    {(PAYMENT_STATUSES as readonly string[]).includes(payment.status)
                      ? tShipments(`paymentStatus.${payment.status as (typeof PAYMENT_STATUSES)[number]}`)
                      : payment.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={payments.page} totalPages={payments.totalPages} href="/dashboard/customer/payments" />
    </main>
  );
};

export default PaymentsPage;
