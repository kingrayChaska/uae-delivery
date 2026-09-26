import BatchList from '@/components/bulk/batch-list';
import StatCard from '@/components/dashboard/stat-card';
import Pagination from '@/components/dashboard/pagination';
import { getBatchDispatchBacklog, listBatches } from '@/services/bulk/list-batches';

import type { StaffListViewProps } from '@/components/staff-views/types';

const BulkBatchesView = async ({ basePath, page }: StaffListViewProps) => {
  const [batches, backlog] = await Promise.all([listBatches(page), getBatchDispatchBacklog()]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Bulk Shipments</h1>
        <p className="text-muted-foreground">Shipment lists submitted by customers and business accounts.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Lists" value={String(batches.total)} />
        <StatCard label="Lists With Parcels to Dispatch" value={String(backlog.lists)} />
        <StatCard label="Shipments Awaiting Dispatch" value={String(backlog.shipments)} />
      </div>

      <BatchList batches={batches.items} hrefBase={`${basePath}/bulk`} showSender />
      <Pagination page={batches.page} totalPages={batches.totalPages} href={`${basePath}/bulk`} />
    </main>
  );
};

export default BulkBatchesView;
