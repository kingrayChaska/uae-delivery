import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import ExpenseReportView from '@/components/finance/expense-report-view';
import { OperatorReportActions } from '@/components/finance/expense-report-actions';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { operatorCanSubmit } from '@/lib/finance/expense-reports';
import { isUuid } from '@/lib/security/validate';
import { getExpenseReport } from '@/services/finance/expense-reports';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.reports'))('meta'),
});

// One of the operator's own reports: review it, submit or resubmit it,
// read the manager's feedback. Another operator's report is "not found"
// (RLS and expense_report_list return nothing).
const OperatorExpenseReportPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRoleOrRedirect('operator');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [detail, t] = await Promise.all([getExpenseReport(id), getTranslations('finance.reports')]);
  if (!detail) notFound();
  const { report } = detail;

  return (
    <ExpenseReportView
      detail={detail}
      backHref="/dashboard/operator/expenses"
      backLabel={t('backToExpenses')}
      actions={
        <OperatorReportActions
          reportId={report.id}
          canSubmit={operatorCanSubmit(report.status)}
          canDiscard={report.status === 'draft' && report.submissionCount === 0}
          resubmit={report.submissionCount > 0}
          expensesHref="/dashboard/operator/expenses"
        />
      }
    />
  );
};

export default OperatorExpenseReportPage;
