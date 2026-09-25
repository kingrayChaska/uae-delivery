import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import EditStaffForm from '@/components/manager/edit-staff-form';
import StaffAccessControls from '@/components/manager/staff-access-controls';

import type { StaffDetail as StaffDetailData } from '@/services/staff/list-staff';

// Shared by /manager/operators/[id] and /manager/drivers/[id].
const StaffDetail = ({ staff }: { staff: StaffDetailData }) => {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{staff.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {staff.email} · <span className="capitalize">{staff.role}</span>
          </p>
          <p className="font-brand-mono text-xs text-muted-foreground">
            Last login: {staff.lastLoginAt ? new Date(staff.lastLoginAt).toLocaleString() : 'Never'}
          </p>
        </div>
        <Badge variant={staff.active ? 'success' : 'secondary'}>{staff.active ? 'Active' : 'Inactive'}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <p className="text-sm font-medium">Details</p>
            {staff.vehicle ? <p className="text-sm text-muted-foreground">Vehicle: {staff.vehicle}</p> : null}
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
              <p className="text-sm font-medium">Access</p>
              <StaffAccessControls profileId={staff.id} active={staff.active} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="mb-2 text-sm font-medium">Recent activity</p>
              {staff.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recorded activity.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {staff.recentActivity.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-3">
                      <span className="font-brand-mono text-xs">{entry.action}</span>
                      <span className="font-brand-mono text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
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
