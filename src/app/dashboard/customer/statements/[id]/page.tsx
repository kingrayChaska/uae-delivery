import { getTranslations } from 'next-intl/server';

import StatementView from '@/components/finance/statement-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.document'))('title'),
});

type Params = Promise<{ id: string }>;

// One of the merchant's account statements. RLS (migration 0044) returns it
// only when it was published to a business account this user belongs to —
// changing the id in the URL to another merchant's statement, or to a
// draft, finds nothing.
const CustomerStatementPage = async ({ params }: { params: Params }) => {
  await requireRoleOrRedirect('customer');
  const { id } = await params;
  return <StatementView statementId={id} role="customer" />;
};

export default CustomerStatementPage;
