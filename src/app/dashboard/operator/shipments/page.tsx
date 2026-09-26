import ShipmentsView from '@/components/staff-views/shipments-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const OperatorShipmentsPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('operator');
  const { page } = await searchParams;
  return <ShipmentsView basePath="/dashboard/operator" page={parsePage(page)} />;
};

export default OperatorShipmentsPage;
