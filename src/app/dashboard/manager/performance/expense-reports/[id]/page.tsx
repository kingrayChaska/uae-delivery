import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import ExpenseReportView from '@/components/finance/expense-report-view';
import { ExpenseCorrectionDialog, ManagerReportReview } from '@/components/finance/expense-report-actions';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { isUuid } from '@/lib/security/validate';
import { getExpenseReport } from '@/services/finance/expense-reports';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.reports'))('meta'),
});

type SearchParams = Promise<{ from?: string; to?: string }>;

// An operator's expense report, opened from Performance Reports: every
// expense with its receipt, the category totals and history; approve it or
// return it with a reason; correct an approved expense with an audited
// correction (migration 0052).
const ManagerExpenseReportPage = async ({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) => {
  await requireRoleOrRedirect('manager');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [detail, t] = await Promise.all([getExpenseReport(id), getTranslations('finance.reports')]);
  if (!detail) notFound();
  const { report } = detail;
  const back = new URLSearchParams();
  if (query.from) back.set('from', query.from);
  if (query.to) back.set('to', query.to);
  const backHref = `/dashboard/manager/performance${back.size ? `?${back}` : ''}#expense-reports`;

  return (
    <ExpenseReportView
      detail={detail}
      backHref={backHref}
      backLabel={t('backToPerformance')}
      actions={report.status === 'submitted' ? <ManagerReportReview reportId={report.id} /> : null}
      entryAction={
        report.status === 'approved'
          ? (entry) => <ExpenseCorrectionDialog expenseId={entry.id} description={entry.description} amount={entry.amount} />
          : undefined
      }
    />
  );
};

export default ManagerExpenseReportPage;
