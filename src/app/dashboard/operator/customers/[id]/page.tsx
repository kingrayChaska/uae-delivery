import CustomerDetailView from '@/components/staff-views/customer-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorCustomerDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('operator');
  const { id } = await params;
  return <CustomerDetailView basePath="/dashboard/operator" id={id} />;
};

export default OperatorCustomerDetailPage;
