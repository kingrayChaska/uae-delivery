import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import DriverDetailView from '@/components/staff-views/driver-detail-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parseDriverDetailParams } from '@/lib/drivers/detail-filters';
import { parsePage } from '@/lib/pagination';
import { isUuid } from '@/lib/security/validate';

import type { Metadata } from 'next';

type Param = string | string[] | undefined;
type SearchParams = Promise<{ q?: Param; status?: Param; period?: Param; from?: Param; to?: Param; page?: Param }>;

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('operator.driverDetail'))('meta'),
});

const OperatorDriverDetailPage = async ({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) => {
  await requireRoleOrRedirect('operator');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  return <DriverDetailView basePath="/dashboard/operator" driverId={id} state={parseDriverDetailParams(query)} page={parsePage(query.page)} />;
};

export default OperatorDriverDetailPage;
