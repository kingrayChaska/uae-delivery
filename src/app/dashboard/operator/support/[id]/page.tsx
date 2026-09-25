import SupportTicketView from '@/components/staff-views/support-ticket-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const OperatorSupportTicketPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('operator');
  const { id } = await params;
  return <SupportTicketView basePath="/dashboard/operator" id={id} />;
};

export default OperatorSupportTicketPage;
