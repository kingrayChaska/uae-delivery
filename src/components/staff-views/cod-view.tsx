import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import StatCard from '@/components/dashboard/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import CodActionsCell from '@/components/operator/cod-actions-cell';
import CodAmountLines from '@/components/shipment/cod-amount-lines';
import ExportLink from '@/components/manager/export-link';
import { getCurrentProfile } from '@/lib/auth/session';
import Pagination from '@/components/dashboard/pagination';
import { getCodTotals, listCodTransactionsPage } from '@/services/cod/list-all-cod';
import { COD_STATUSES } from '@/lib/types';
import { getFormat } from '@/i18n/server';

import type { StaffListViewProps } from '@/components/staff-views/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success'> = {
  expected: 'secondary',
  collected: 'default',
  reconciled: 'success',
  remitted: 'success',
};

const CodView = async ({ basePath, page }: StaffListViewProps) => {
  const [profile, records, totals, t, tStatus, format] = await Promise.all([
    getCurrentProfile(),
    listCodTransactionsPage(page),
    getCodTotals(),
    getTranslations('operator.cod'),
    getTranslations('shipments.codStatus'),
    getFormat(),
  ]);
  const total = (status: string) => format.money(totals[status] ?? 0);
  const statusLabel = (status: string) =>
    (COD_STATUSES as readonly string[]).includes(status) ? tStatus(status as (typeof COD_STATUSES)[number]) : status;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {profile?.role === 'manager' ? (
          <ExportLink
            type="cod"
            from={new Date(0).toISOString().slice(0, 10)}
            to={new Date().toISOString().slice(0, 10)}
            label={t('export')}
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={statusLabel('expected')} value={total('expected')} />
        <StatCard label={statusLabel('collected')} value={total('collected')} />
        <StatCard label={statusLabel('reconciled')} value={total('reconciled')} />
        <StatCard label={statusLabel('remitted')} value={total('remitted')} />
      </div>

      {records.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.items.map((record) => (
            <Card key={record.id}>
              <CardContent className="flex items-center justify-between gap-4 pt-6 text-sm">
                <div>
                  <p dir="ltr" className="font-brand-mono text-xs text-muted-foreground rtl:text-right">
                    {record.trackingNumber}
                  </p>
                  <p>{t('driver', { name: record.driverName })}</p>
                  <CodAmountLines
                    productAmount={record.productAmount}
                    deliveryFeeAmount={record.deliveryFeeAmount}
                    total={record.amount}
                    currency={record.currency}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[record.status] ?? 'default'}>{statusLabel(record.status)}</Badge>
                  <CodActionsCell codTransactionId={record.id} status={record.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={records.page} totalPages={records.totalPages} href={`${basePath}/cod`} />
    </main>
  );
};

export default CodView;
