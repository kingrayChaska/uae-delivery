import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import DeleteStaffAccount from '@/components/manager/delete-staff-account';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listAllDrivers } from '@/services/drivers/list-all-drivers';
import { getFormat } from '@/i18n/server';

const AVAILABILITY_VARIANT: Record<string, 'success' | 'secondary' | 'default'> = {
  available: 'success',
  busy: 'secondary',
  offline: 'default',
};

const ManagerDriversPage = async ({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { deleted } = await searchParams;
  const [drivers, t, tAvailability, format] = await Promise.all([
    listAllDrivers(),
    getTranslations('manager.staff'),
    getTranslations('shipments.driverAvailability'),
    getFormat(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('driversTitle')}</h1>
        <Button asChild>
          <Link href="/dashboard/manager/drivers/new">{t('addDriver')}</Link>
        </Button>
      </div>

      {deleted === '1' ? (
        <p role="status" className="rounded-xl border border-success/50 bg-success/10 p-3 text-sm">
          {t('deleted')}
        </p>
      ) : null}

      {drivers.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('noDrivers')}</p>
          <p className="text-sm text-muted-foreground">{t('noDriversBody')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('columns.driver')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.vehicle')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.status')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.periods')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.outcomes')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.cod')}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">
                  <span className="sr-only">{t('columns.actions')}</span>
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
                      <span dir="ltr">{driver.driverCode}</span> · <span dir="ltr">{driver.phone}</span>
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs">{driver.vehicle ?? '—'}</td>
                  <td className="px-3 py-2">
                    {driver.active ? (
                      <Badge variant={AVAILABILITY_VARIANT[driver.availability]}>{tAvailability(driver.availability)}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('inactive')}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-brand-mono whitespace-nowrap">
                    {format.number(driver.todayDeliveries)} / {format.number(driver.weekDeliveries)} / {format.number(driver.monthDeliveries)}
                  </td>
                  <td className="px-3 py-2 font-brand-mono whitespace-nowrap">
                    {format.number(driver.successfulDeliveries)} / {format.number(driver.failedDeliveries)}
                  </td>
                  <td className="px-3 py-2 font-brand-mono whitespace-nowrap">{format.money(driver.codCollected)}</td>
                  <td className="px-3 py-2 text-end">
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
