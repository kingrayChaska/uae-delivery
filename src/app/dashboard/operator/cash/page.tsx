import { getTranslations } from 'next-intl/server';

import CashView from '@/components/staff-views/cash-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parseCashFilters } from '@/lib/cash/schemas';
import { parsePage } from '@/lib/pagination';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('operator.cash'))('meta'),
});

const OperatorCashPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; q?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) => {
  await requireRoleOrRedirect('operator');
  const params = await searchParams;
  return <CashView basePath="/dashboard/operator" page={parsePage(params.page)} filters={parseCashFilters(params)} />;
};

export default OperatorCashPage;
