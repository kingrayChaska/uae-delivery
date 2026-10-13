import { getTranslations } from 'next-intl/server';

import StatementView from '@/components/finance/statement-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.document'))('title'),
});

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ generated?: string; published?: string }>;

// Preview (draft), published or superseded statement. RLS decides what this
// manager may open (migration 0044).
const ManagerStatementPage = async ({ params, searchParams }: { params: Params; searchParams: SearchParams }) => {
  await requireRoleOrRedirect('manager');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const notice = query.published === '1' ? 'published' : query.generated === '1' ? 'generated' : null;
  return <StatementView statementId={id} role="manager" notice={notice} />;
};

export default ManagerStatementPage;
