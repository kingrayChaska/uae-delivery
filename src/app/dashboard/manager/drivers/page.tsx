import Link from 'next/link';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import DeleteStaffAccount from '@/components/manager/delete-staff-account';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listAllDrivers } from '@/services/drivers/list-all-drivers';

const AVAILABILITY_VARIANT: Record<string, 'success' | 'secondary' | 'default'> = {
  available: 'success',
  busy: 'secondary',
  offline: 'default',
};

const ManagerDriversPage = async ({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { deleted } = await searchParams;
  const drivers = await listAllDrivers();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Drivers</h1>
        <Button asChild>
          <Link href="/dashboard/manager/drivers/new">Add driver</Link>
        </Button>
      </div>

      {deleted === '1' ? (
        <p role="status" className="rounded-xl border border-success/50 bg-success/10 p-3 text-sm">
          Account deleted. Their past activity is kept in the history.
        </p>
      ) : null}

      {drivers.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No drivers yet</p>
          <p className="text-sm text-muted-foreground">Add a driver to start dispatching deliveries.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Driver</th>
                <th className="px-3 py-2 font-medium">Vehicle</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Today / Week / Month</th>
                <th className="px-3 py-2 font-medium">Delivered / Failed</th>
                <th className="px-3 py-2 font-medium">COD collected</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id} className="border-t hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/manager/drivers/${driver.id}`} className="font-medium hover:underline">
                      {driver.fullName}
                    </Link>
                    <p className="font-brand-mono text-xs text-muted-foreground">
                      {driver.driverCode} · {driver.phone}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs">{driver.vehicle ?? '—'}</td>
                  <td className="px-3 py-2">
                    {driver.active ? (
                      <Badge variant={AVAILABILITY_VARIANT[driver.availability]}>{driver.availability}</Badge>
                    ) : (
                      <Badge variant="secondary">inactive</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-brand-mono">
                    {driver.todayDeliveries} / {driver.weekDeliveries} / {driver.monthDeliveries}
                  </td>
                  <td className="px-3 py-2 font-brand-mono">
                    {driver.successfulDeliveries} / {driver.failedDeliveries}
                  </td>
                  <td className="px-3 py-2 font-brand-mono">AED {driver.codCollected.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <DeleteStaffAccount compact profileId={driver.id} fullName={driver.fullName} role="driver" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
};

export default ManagerDriversPage;
