import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import EditStaffForm from '@/components/manager/edit-staff-form';
import StaffAccessControls from '@/components/manager/staff-access-controls';
import DeleteStaffAccount from '@/components/manager/delete-staff-account';

import { getFormat } from '@/i18n/server';

import type { StaffDetail as StaffDetailData } from '@/services/staff/list-staff';

// Shared by /manager/operators/[id] and /manager/drivers/[id].
const StaffDetail = async ({ staff }: { staff: StaffDetailData }) => {
  const [t, tRoles, format] = await Promise.all([
    getTranslations('manager.staff'),
    getTranslations('shipments.roles'),
    getFormat(),
  ]);
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{staff.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            <span dir="ltr">{staff.email}</span> · {tRoles(staff.role)}
          </p>
          <p className="font-brand-mono text-xs text-muted-foreground">
            {t('lastLogin', { time: staff.lastLoginAt ? format.dateTime(staff.lastLoginAt) : t('never') })}
          </p>
        </div>
        <Badge variant={staff.active ? 'success' : 'secondary'}>{staff.active ? t('active') : t('inactive')}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <p className="text-sm font-medium">{t('details')}</p>
            {staff.vehicle ? <p className="text-sm text-muted-foreground">{t('vehicle', { vehicle: staff.vehicle })}</p> : null}
            <EditStaffForm
              role={staff.role}
              defaultValues={{
                profileId: staff.id,
                fullName: staff.fullName,
                phone: staff.phone,
                employeeId: staff.employeeId ?? '',
                driverCode: staff.driverCode ?? '',
                licenseNumber: staff.licenseNumber ?? '',
              }}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <p className="text-sm font-medium">{t('access')}</p>
              <StaffAccessControls profileId={staff.id} active={staff.active} />
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardContent className="flex flex-col items-start gap-3 pt-6">
              <div>
                <p className="text-sm font-medium text-destructive">{t('dangerZone')}</p>
                <p className="text-sm text-muted-foreground">{t('dangerBody')}</p>
              </div>
              <DeleteStaffAccount profileId={staff.id} fullName={staff.fullName} role={staff.role} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="mb-2 text-sm font-medium">{t('recentActivity')}</p>
              {staff.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noActivity')}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {staff.recentActivity.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-3">
                      <span className="font-brand-mono text-xs">{entry.action}</span>
                      <span className="font-brand-mono text-xs text-muted-foreground">
                        {format.dateTime(entry.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
};

export default StaffDetail;
