import CodView from '@/components/staff-views/cod-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';

import type { PageSearchParams } from '@/lib/pagination';

const OperatorCodPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('operator');
  const { page } = await searchParams;
  return <CodView basePath="/dashboard/operator" page={parsePage(page)} />;
};

export default OperatorCodPage;
