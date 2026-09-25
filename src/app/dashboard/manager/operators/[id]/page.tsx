import { notFound } from 'next/navigation';

import StaffDetail from '@/components/manager/staff-detail';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getStaffDetail } from '@/services/staff/list-staff';

const ManagerOperatorDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { id } = await params;

  const staff = await getStaffDetail(id);
  if (!staff || staff.role !== 'operator') notFound();

  return <StaffDetail staff={staff} />;
};

export default ManagerOperatorDetailPage;
