import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import CashDriverView from '@/components/staff-views/cash-driver-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parseDriverLedgerFilters } from '@/lib/cash/schemas';
import { parsePage } from '@/lib/pagination';
import { isUuid } from '@/lib/security/validate';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('operator.cash'))('meta'),
});

type Params = {
  q?: string | string[];
  from?: string | string[];
  to?: string | string[];
  collection?: string | string[];
  remittance?: string | string[];
  cp?: string | string[];
  rp?: string | string[];
};

const ManagerDriverCashPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ driverId: string }>;
  searchParams: Promise<Params>;
}) => {
  await requireRoleOrRedirect('manager');
  const [{ driverId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(driverId)) notFound();
  return (
    <CashDriverView
      basePath="/dashboard/manager"
      driverId={driverId}
      filters={parseDriverLedgerFilters(query)}
      collectionsPage={parsePage(query.cp)}
      remittancesPage={parsePage(query.rp)}
    />
  );
};

export default ManagerDriverCashPage;
