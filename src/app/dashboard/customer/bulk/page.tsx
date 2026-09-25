import Link from 'next/link';

import Button from '@/components/ui/button';
import BatchList from '@/components/bulk/batch-list';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { BULK_MAX_ROWS } from '@/lib/business/schemas';
import { listBatches } from '@/services/bulk/list-batches';

const CustomerBulkPage = async () => {
  await requireRoleOrRedirect('customer');
  const batches = await listBatches();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Bulk Shipments</h1>
          <p className="text-muted-foreground">
            Sending lots of parcels at once? Submit up to {BULK_MAX_ROWS} shipments in one list and our operations
            team will schedule the pickup.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/customer/bulk/new">New bulk list</Link>
        </Button>
      </div>

      <BatchList
        batches={batches}
        hrefBase="/dashboard/customer/bulk"
        emptyMessage="You haven't submitted a bulk list yet"
      />
    </main>
  );
};

export default CustomerBulkPage;
