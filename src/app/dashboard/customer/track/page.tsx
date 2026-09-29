import Link from 'next/link';
import { ArrowRight, PackageSearch } from 'lucide-react';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ShipmentStatusBadge from '@/components/shipment/shipment-status-badge';
import MyShipmentLookup from '@/components/shipment/my-shipment-lookup';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getTrackingMilestones } from '@/lib/shipment/tracking-milestones';
import { listCustomerActiveShipments } from '@/services/shipments/list-shipments';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Track shipments · ParcelLink' };

const TrackPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  const active = await listCustomerActiveShipments(profile.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Track shipments</h1>
        <p className="text-muted-foreground">Follow every parcel you’ve booked, from pickup to proof of delivery.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <MyShipmentLookup />
        </CardContent>
      </Card>

      <section aria-labelledby="active-heading" className="flex flex-col gap-3">
        <h2 id="active-heading" className="text-lg font-medium">
          On the way <span className="text-muted-foreground">({active.length})</span>
        </h2>

        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
            <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">No shipments on the way right now.</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/customer/deliveries">See past deliveries</Link>
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {active.map((shipment) => {
              const milestones = getTrackingMilestones(shipment.status);
              const doneCount = milestones.filter((m) => m.done).length;
              const current = milestones.find((m) => m.current);
              return (
                <li key={shipment.id}>
                  <Link
                    href={`/dashboard/customer/deliveries/${shipment.id}`}
                    className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-brand-mono font-semibold tracking-wider">{shipment.trackingNumber}</span>
                      <ShipmentStatusBadge status={shipment.status} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">To {shipment.dropoff.formattedAddress}</p>
                    <div
                      role="progressbar"
                      aria-label={`Progress for ${shipment.trackingNumber}`}
                      aria-valuemin={0}
                      aria-valuemax={milestones.length}
                      aria-valuenow={doneCount}
                      aria-valuetext={current?.label}
                      className="h-2 overflow-hidden rounded-full bg-secondary"
                    >
                      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(doneCount / milestones.length) * 100}%` }} />
                    </div>
                    <p className="flex items-center justify-between text-sm font-medium">
                      {current?.label ?? 'Awaiting payment'}
                      <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
};

export default TrackPage;
