import { Card, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import Pagination from '@/components/dashboard/pagination';
import MarkCodCollectedButton from '@/components/driver/mark-cod-collected-button';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { listDriverCodTransactions } from '@/services/shipments/list-driver-cod';

import type { PageSearchParams } from '@/lib/pagination';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success'> = {
  expected: 'secondary',
  collected: 'default',
  reconciled: 'success',
  remitted: 'success',
};

const DriverCodPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  const profile = await requireRoleOrRedirect('driver');
  const records = await listDriverCodTransactions(profile.id, parsePage((await searchParams).page));

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Cash on Delivery</h1>

      {records.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No COD collections</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.items.map((record) => (
            <Card key={record.id}>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div>
                  <p className="font-brand-mono text-sm text-muted-foreground">{record.trackingNumber}</p>
                  <p className="font-brand-mono text-lg">
                    {record.currency} {record.amount.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[record.status] ?? 'default'}>{record.status}</Badge>
                  {record.status === 'expected' ? <MarkCodCollectedButton codTransactionId={record.id} /> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={records.page} totalPages={records.totalPages} href="/dashboard/driver/cod" />
    </main>
  );
};

export default DriverCodPage;
