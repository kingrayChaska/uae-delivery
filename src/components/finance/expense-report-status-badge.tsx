import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';

import type { ExpenseReviewState } from '@/lib/finance/expense-reports';

const VARIANT: Record<ExpenseReviewState, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  unreported: 'outline',
  draft: 'secondary',
  submitted: 'default',
  approved: 'success',
  returned: 'warning',
};

// A report's status, or an expense's review state.
const ExpenseReportStatusBadge = ({ status }: { status: ExpenseReviewState }) => {
  const t = useTranslations('finance.reports.status');
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
};

export default ExpenseReportStatusBadge;
