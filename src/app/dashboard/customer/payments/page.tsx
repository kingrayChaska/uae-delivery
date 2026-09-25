import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listCustomerPayments } from '@/services/shipments/list-payments';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'destructive'> = {
  paid: 'success',
  pending: 'secondary',
  failed: 'destructive',
  refunded: 'destructive',
};

const PaymentsPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  const payments = await listCustomerPayments(profile.id);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Payments</h1>

      {payments.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No payments yet</p>
          <p className="text-sm text-muted-foreground">Payment history for your deliveries appears here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div>
                  <Link
                    href={`/dashboard/customer/deliveries/${payment.shipmentId}`}
                    className="font-brand-mono text-sm text-muted-foreground hover:underline"
                  >
                    {payment.trackingNumber}
                  </Link>
                  <p className="text-sm uppercase text-muted-foreground">{payment.method}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-brand-mono text-sm">
                    {payment.currency} {payment.amount.toFixed(2)}
                  </span>
                  <Badge variant={STATUS_VARIANT[payment.status] ?? 'default'}>{payment.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
};

export default PaymentsPage;
