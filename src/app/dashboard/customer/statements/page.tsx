import { getTranslations } from 'next-intl/server';
import { CircleAlert } from 'lucide-react';

import Pagination from '@/components/dashboard/pagination';
import StatementTable from '@/components/finance/statement-table';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { failedLoad } from '@/lib/finance/load-error';
import { parsePage } from '@/lib/pagination';
import { STATEMENT_PAGE_SIZE, listStatements } from '@/services/finance/statements';

import type { Metadata } from 'next';
import type { PageSearchParams } from '@/lib/pagination';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.portal'))('meta'),
});

// Account Reports: the statements ParcelLink has published to this
// merchant's business. RLS returns only those (never a draft, never another
// merchant's); a statement that was later corrected stays listed, marked
// superseded.
const CustomerStatementsPage = async ({ searchParams }: { searchParams: PageSearchParams }) => {
  await requireRoleOrRedirect('customer');
  const [{ page: pageParam }, t] = await Promise.all([searchParams, getTranslations('finance.portal')]);
  const page = parsePage(pageParam);
  const list = await listStatements({ page }).catch(failedLoad('Account reports'));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      {!list ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <CircleAlert className="size-4" aria-hidden />
          {t('loadFailed')}
        </p>
      ) : list.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <StatementTable rows={list.rows} href={(id) => `/dashboard/customer/statements/${id}`} showMerchant={false} />
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(list.total / STATEMENT_PAGE_SIZE))} href="/dashboard/customer/statements" />
        </>
      )}
    </main>
  );
};

export default CustomerStatementsPage;
