import Badge from '@/components/ui/badge';
import StatCard from '@/components/dashboard/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import CodActionsCell from '@/components/operator/cod-actions-cell';
import ExportLink from '@/components/manager/export-link';
import { getCurrentProfile } from '@/lib/auth/session';
import { listAllCodTransactions } from '@/services/cod/list-all-cod';


const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success'> = {
  expected: 'secondary',
  collected: 'default',
  reconciled: 'success',
  remitted: 'success',
};

const sumByStatus = (records: { status: string; amount: number }[], status: string) =>
  records.filter((r) => r.status === status).reduce((sum, r) => sum + r.amount, 0);

const CodView = async () => {
  const [profile, records] = await Promise.all([getCurrentProfile(), listAllCodTransactions()]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cash on Delivery</h1>
        {profile?.role === 'manager' ? (
          <ExportLink
            type="cod"
            from={new Date(0).toISOString().slice(0, 10)}
            to={new Date().toISOString().slice(0, 10)}
            label="Export CSV"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Expected" value={`AED ${sumByStatus(records, 'expected').toFixed(2)}`} />
        <StatCard label="Collected" value={`AED ${sumByStatus(records, 'collected').toFixed(2)}`} />
        <StatCard label="Reconciled" value={`AED ${sumByStatus(records, 'reconciled').toFixed(2)}`} />
        <StatCard label="Remitted" value={`AED ${sumByStatus(records, 'remitted').toFixed(2)}`} />
      </div>

      {records.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No COD transactions</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((record) => (
            <Card key={record.id}>
              <CardContent className="flex items-center justify-between gap-4 pt-6 text-sm">
                <div>
                  <p className="font-brand-mono text-xs text-muted-foreground">{record.trackingNumber}</p>
                  <p>Driver: {record.driverName}</p>
                  <p className="font-brand-mono">
                    {record.currency} {record.amount.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[record.status] ?? 'default'}>{record.status}</Badge>
                  <CodActionsCell codTransactionId={record.id} status={record.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
};

export default CodView;
