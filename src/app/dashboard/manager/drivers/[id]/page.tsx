import { notFound } from 'next/navigation';

import StaffDetail from '@/components/manager/staff-detail';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getStaffDetail } from '@/services/staff/list-staff';

const ManagerDriverDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { id } = await params;

  const staff = await getStaffDetail(id);
  if (!staff || staff.role !== 'driver') notFound();

  return <StaffDetail staff={staff} />;
};

export default ManagerDriverDetailPage;
