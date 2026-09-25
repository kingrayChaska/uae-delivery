import Link from 'next/link';

import BatchStatusBadge from '@/components/bulk/batch-status-badge';
import { formatPickupDate } from '@/lib/bulk/format';

import type { BatchSummary } from '@/services/bulk/list-batches';

type BatchListProps = {
  batches: BatchSummary[];
  hrefBase: string;
  // Staff see who sent each list; a customer only ever sees their own.
  showSender?: boolean;
  emptyMessage?: string;
};

const BatchList = ({ batches, hrefBase, showSender = false, emptyMessage = 'No bulk lists yet' }: BatchListProps) => {
  if (batches.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {batches.map((batch) => (
        <Link
          key={batch.id}
          href={`${hrefBase}/${batch.id}`}
          className="flex flex-col gap-3 rounded-md border p-4 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-brand-mono text-sm text-muted-foreground">{batch.reference}</p>
            <p className="truncate font-medium">{batch.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {showSender ? `${batch.companyName ?? batch.customer.fullName} · ` : ''}
              Pickup {formatPickupDate(batch.pickupDate)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-brand-mono">
              {batch.shipmentCount} shipments · {batch.parcelCount} items
            </span>
            <span className="font-brand-mono">
              {batch.currency} {batch.totalPrice.toFixed(2)}
            </span>
            {batch.progress.awaitingDispatch > 0 ? (
              <span className="text-muted-foreground">{batch.progress.awaitingDispatch} awaiting dispatch</span>
            ) : null}
            <BatchStatusBadge status={batch.status} />
          </div>
        </Link>
      ))}
    </div>
  );
};

export default BatchList;
