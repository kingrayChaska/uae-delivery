import { getTranslations } from 'next-intl/server';

import BatchList from '@/components/bulk/batch-list';
import StatCard from '@/components/dashboard/stat-card';
import Pagination from '@/components/dashboard/pagination';
import { getBatchDispatchBacklog, listBatches } from '@/services/bulk/list-batches';
import { getFormat } from '@/i18n/server';

import type { StaffListViewProps } from '@/components/staff-views/types';

const BulkBatchesView = async ({ basePath, page }: StaffListViewProps) => {
  const [batches, backlog, t, format] = await Promise.all([
    listBatches(page),
    getBatchDispatchBacklog(),
    getTranslations('operator.bulk'),
    getFormat(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('stats.lists')} value={format.number(batches.total)} />
        <StatCard label={t('stats.listsToDispatch')} value={format.number(backlog.lists)} />
        <StatCard label={t('stats.awaiting')} value={format.number(backlog.shipments)} />
      </div>

      <BatchList batches={batches.items} hrefBase={`${basePath}/bulk`} showSender />
      <Pagination page={batches.page} totalPages={batches.totalPages} href={`${basePath}/bulk`} />
    </main>
  );
};

export default BulkBatchesView;
