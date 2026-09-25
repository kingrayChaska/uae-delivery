import SupportTicketView from '@/components/staff-views/support-ticket-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

const ManagerSupportTicketPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { id } = await params;
  return <SupportTicketView basePath="/dashboard/manager" id={id} />;
};

export default ManagerSupportTicketPage;
