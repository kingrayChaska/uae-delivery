import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import BatchStatusBadge from '@/components/bulk/batch-status-badge';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import { formatPickupDate } from '@/lib/bulk/format';

import type { BatchDetail as BatchDetailData } from '@/services/bulk/list-batches';

type BatchDetailProps = {
  batch: BatchDetailData;
  backHref: string;
  shipmentBasePath: string;
  // Staff get the sender's contact details; the customer already knows them.
  showSender?: boolean;
};

const BatchDetail = ({ batch, backHref, shipmentBasePath, showSender = false }: BatchDetailProps) => {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
        ← All bulk lists
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-brand-mono text-sm text-muted-foreground">{batch.reference}</p>
          <h1 className="text-2xl font-semibold">{batch.name}</h1>
          <p className="text-sm text-muted-foreground">
            Submitted {new Date(batch.createdAt).toLocaleString()} · Pickup {formatPickupDate(batch.pickupDate)}
          </p>
        </div>
        <BatchStatusBadge status={batch.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Shipments" value={`${batch.shipmentCount} (${batch.parcelCount} items)`} />
        <StatCard label="Awaiting Dispatch" value={String(batch.progress.awaitingDispatch)} />
        <StatCard label="In Progress / Delivered" value={`${batch.progress.inProgress} / ${batch.progress.delivered}`} />
        <StatCard label="Total" value={`${batch.currency} ${batch.totalPrice.toFixed(2)}`} />
      </div>

      {showSender || batch.notes ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 text-sm">
            {showSender ? (
              <div>
                <p className="text-xs text-muted-foreground">Sender</p>
                <p className="font-medium">{batch.companyName ?? batch.customer.fullName}</p>
                <p className="text-muted-foreground">
                  {batch.companyName ? `${batch.customer.fullName} · ` : ''}
                  {[batch.customer.email, batch.customer.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
            ) : null}
            {batch.notes ? (
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-line">{batch.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {batch.failedRows.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Rows that were not created ({batch.failedRows.length})</h2>
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {batch.failedRows.map((row) => (
              <li key={row.rowNumber} className="flex gap-4 px-3 py-2">
                <span className="shrink-0 font-brand-mono text-xs text-muted-foreground">Row {row.rowNumber}</span>
                <span className="text-destructive">{row.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Shipments</h2>
        {batch.status === 'processing' ? (
          <p className="text-sm text-muted-foreground">This list is still being processed — refresh in a moment.</p>
        ) : null}
        {batch.shipments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shipments were created from this list.</p>
        ) : (
          batch.shipments.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} basePath={shipmentBasePath} />
          ))
        )}
      </div>
    </main>
  );
};

export default BatchDetail;
