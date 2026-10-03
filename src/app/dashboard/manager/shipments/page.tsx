import ShipmentsView from '@/components/staff-views/shipments-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { isUuid } from '@/lib/security/validate';

const ManagerShipmentsPage = async ({ searchParams }: { searchParams: Promise<{ page?: string | string[]; batch?: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { page, batch } = await searchParams;
  return <ShipmentsView basePath="/dashboard/manager" page={parsePage(page)} batchId={isUuid(batch) ? batch : null} />;
};

export default ManagerShipmentsPage;
