import CustomerDetailView from '@/components/staff-views/customer-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerCustomerDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { id } = await params;
  return <CustomerDetailView basePath="/dashboard/manager" id={id} />;
};

export default ManagerCustomerDetailPage;
