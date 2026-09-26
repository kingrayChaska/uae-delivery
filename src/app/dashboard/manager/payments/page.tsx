import Link from 'next/link';

import Badge from '@/components/ui/badge';
import Pagination from '@/components/dashboard/pagination';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { listAllPayments } from '@/services/payments/list-all-payments';

import type { PageSearchParams } from '@/lib/pagination';

const ManagerPaymentsPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('manager');
  const payments = await listAllPayments(parsePage((await searchParams).page));

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Payments</h1>
      <p className="text-sm text-muted-foreground">
        Card payments appear once a payment provider is connected (see Settings). Cash-on-delivery amounts are listed
        from their shipments.
      </p>

      {payments.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No payments yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Shipment</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.items.map((payment) => (
                <tr key={`${payment.method}-${payment.id}`} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/manager/shipments/${payment.shipmentId}`}
                      className="font-brand-mono text-xs hover:underline"
                    >
                      {payment.trackingNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{payment.customerName}</td>
                  <td className="px-3 py-2 uppercase text-xs">{payment.method}</td>
                  <td className="px-3 py-2 font-brand-mono">
                    {payment.currency} {payment.amount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{payment.status}</Badge>
                  </td>
                  <td className="px-3 py-2 font-brand-mono text-xs text-muted-foreground">
                    {new Date(payment.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={payments.page} totalPages={payments.totalPages} href="/dashboard/manager/payments" />
    </main>
  );
};

export default ManagerPaymentsPage;
