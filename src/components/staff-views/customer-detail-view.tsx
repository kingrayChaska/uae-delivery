import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import StatCard from '@/components/dashboard/stat-card';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import Pagination from '@/components/dashboard/pagination';
import { isUuid } from '@/lib/security/validate';
import { getCustomerDetail } from '@/services/customers/list-customers';
import { getFormat } from '@/i18n/server';

import type { StaffDetailListViewProps } from '@/components/staff-views/types';

const CustomerDetailView = async ({ basePath, id, page }: StaffDetailListViewProps) => {
  if (!isUuid(id)) notFound();
  const detail = await getCustomerDetail(id, page);
  if (!detail) notFound();

  const { customer, shipments } = detail;
  const [t, tShipments, format] = await Promise.all([getTranslations('operator.customers'), getTranslations('operator.shipments'), getFormat()]);
  const pageHref = `${basePath}/customers/${customer.id}`;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Link href={`${basePath}/customers`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('title')}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
          <span className="wrap-break-word">{customer.fullName}</span>
          <Badge variant={customer.accountType === 'merchant' ? 'secondary' : 'outline'}>{t(`accountType.${customer.accountType}`)}</Badge>
          {!customer.active ? <Badge variant="outline">{t('inactive')}</Badge> : null}
        </h1>
        {customer.companyName ? <p className="font-medium">{t('companyOf', { company: customer.companyName })}</p> : null}
        <p className="text-sm text-muted-foreground wrap-anywhere">
          <span dir="ltr">{customer.email}</span> · <span dir="ltr">{customer.phone}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label={t('stats.shipments')} value={format.number(customer.shipmentCount)} />
        <StatCard label={t('stats.paid')} value={format.money(customer.totalSpent)} />
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="customer-activity">
        <h2 id="customer-activity" className="text-lg font-medium">
          {t('history')}
        </h2>
        {shipments === null ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              {t('activityError')}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref}>{tShipments('retry')}</Link>
            </Button>
          </div>
        ) : (
          <>
            {shipments.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noShipments')}</p>
            ) : (
              shipments.items.map((shipment) => (
                <ShipmentListItem key={shipment.id} shipment={shipment} basePath={`${basePath}/shipments`} showBookedAt />
              ))
            )}
            <Pagination page={shipments.page} totalPages={shipments.totalPages} href={pageHref} />
          </>
        )}
      </section>
    </main>
  );
};

export default CustomerDetailView;
