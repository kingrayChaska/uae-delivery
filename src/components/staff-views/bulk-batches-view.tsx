import BatchList from '@/components/bulk/batch-list';
import StatCard from '@/components/dashboard/stat-card';
import { listBatches } from '@/services/bulk/list-batches';

import type { StaffViewProps } from '@/components/staff-views/types';

const BulkBatchesView = async ({ basePath }: StaffViewProps) => {
  const batches = await listBatches();
  const awaitingDispatch = batches.reduce((sum, batch) => sum + batch.progress.awaitingDispatch, 0);
  const listsWaiting = batches.filter((batch) => batch.progress.awaitingDispatch > 0).length;

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Bulk Shipments</h1>
        <p className="text-muted-foreground">Shipment lists submitted by customers and business accounts.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Lists" value={String(batches.length)} />
        <StatCard label="Lists With Parcels to Dispatch" value={String(listsWaiting)} />
        <StatCard label="Shipments Awaiting Dispatch" value={String(awaitingDispatch)} />
      </div>

      <BatchList batches={batches} hrefBase={`${basePath}/bulk`} showSender />
    </main>
  );
};

export default BulkBatchesView;
