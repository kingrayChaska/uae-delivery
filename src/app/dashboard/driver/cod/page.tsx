import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import Pagination from '@/components/dashboard/pagination';
import MarkCodCollectedButton from '@/components/driver/mark-cod-collected-button';
import CodAmountLines from '@/components/shipment/cod-amount-lines';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { listDriverCodTransactions } from '@/services/shipments/list-driver-cod';
import { COD_STATUSES } from '@/lib/types';

import type { Metadata } from 'next';
import type { PageSearchParams } from '@/lib/pagination';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('driver.cod'))('meta'),
});

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success'> = {
  expected: 'secondary',
  collected: 'default',
  reconciled: 'success',
  remitted: 'success',
};

const DriverCodPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  const profile = await requireRoleOrRedirect('driver');
  const [records, t, tStatus] = await Promise.all([
    listDriverCodTransactions(profile.id, parsePage((await searchParams).page)),
    getTranslations('driver.cod'),
    getTranslations('shipments.codStatus'),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {records.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.items.map((record) => (
            <Card key={record.id}>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div>
                  <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground rtl:text-right">
                    {record.trackingNumber}
                  </p>
                  <CodAmountLines
                    productAmount={record.productAmount}
                    deliveryFeeAmount={record.deliveryFeeAmount}
                    total={record.amount}
                    currency={record.currency}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[record.status] ?? 'default'}>
                    {(COD_STATUSES as readonly string[]).includes(record.status)
                      ? tStatus(record.status as (typeof COD_STATUSES)[number])
                      : record.status}
                  </Badge>
                  {record.status === 'expected' ? <MarkCodCollectedButton codTransactionId={record.id} /> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={records.page} totalPages={records.totalPages} href="/dashboard/driver/cod" />
    </main>
  );
};

export default DriverCodPage;
