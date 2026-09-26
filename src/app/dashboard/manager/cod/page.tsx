import CodView from '@/components/staff-views/cod-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const ManagerCodPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('manager');
  const { page } = await searchParams;
  return <CodView basePath="/dashboard/manager" page={parsePage(page)} />;
};

export default ManagerCodPage;
