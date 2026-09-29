import Link from 'next/link';
import { CircleAlert, CircleCheck, PackagePlus, PackageSearch } from 'lucide-react';

import Button from '@/components/ui/button';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import Pagination from '@/components/dashboard/pagination';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { isUuid } from '@/lib/security/validate';
import { sumPrices } from '@/lib/pricing/calculate';
import { getCustomerBooking, listCustomerShipments } from '@/services/shipments/list-shipments';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My deliveries · ParcelLink' };

const DeliveriesPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; booking?: string; booked?: string; failed?: string }>;
}) => {
  const profile = await requireRoleOrRedirect('customer');
  const params = await searchParams;
  const bookingId = params.booking && isUuid(params.booking) ? params.booking : null;
  const [shipments, booking] = await Promise.all([
    listCustomerShipments(profile.id, parsePage(params.page)),
    bookingId ? getCustomerBooking(profile.id, bookingId) : Promise.resolve(null),
  ]);
  const failed = Number(params.failed ?? 0);

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My Deliveries</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/customer/track">
              <PackageSearch aria-hidden />
              Track
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/customer/book">
              <PackagePlus aria-hidden />
              Book delivery
            </Link>
          </Button>
        </div>
      </div>

      {booking ? (
        <section
          aria-labelledby="booking-heading"
          className="flex flex-col gap-3 rounded-2xl border border-success/40 bg-success/5 p-4 sm:p-5 animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id="booking-heading" className="flex items-center gap-2 font-semibold">
              <CircleCheck className="size-5 text-success" aria-hidden />
              {params.booked === '1' ? 'Booking confirmed' : 'Booking'} · {booking.reference}
            </h2>
            <span className="font-brand-mono text-sm font-medium">
              {booking.shipments.length} shipments · AED {sumPrices(booking.shipments.map((s) => s.price)).toFixed(2)}
            </span>
          </div>
          {failed > 0 ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {failed} {failed === 1 ? 'shipment' : 'shipments'} couldn’t be booked. Book {failed === 1 ? 'it' : 'them'} again from Book Delivery.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {booking.shipments.map((shipment) => (
              <ShipmentListItem key={shipment.id} shipment={shipment} />
            ))}
          </div>
        </section>
      ) : null}

      {shipments.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">No deliveries yet</p>
            <p className="text-sm text-muted-foreground">Your booked shipments will appear here.</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/customer/book">Book your first delivery</Link>
          </Button>
        </div>
      ) : (
        <section aria-label="All deliveries" className="flex flex-col gap-2">
          {booking ? <h2 className="mt-2 text-lg font-medium">All deliveries</h2> : null}
          {shipments.items.map((shipment) => (
            <ShipmentListItem key={shipment.id} shipment={shipment} />
          ))}
        </section>
      )}

      <Pagination page={shipments.page} totalPages={shipments.totalPages} href="/dashboard/customer/deliveries" />
    </main>
  );
};

export default DeliveriesPage;
