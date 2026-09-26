import ShipmentsView from '@/components/staff-views/shipments-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const ManagerShipmentsPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('manager');
  const { page } = await searchParams;
  return <ShipmentsView basePath="/dashboard/manager" page={parsePage(page)} />;
};

export default ManagerShipmentsPage;
