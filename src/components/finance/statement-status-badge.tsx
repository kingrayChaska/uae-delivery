import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';

import type { StatementStatus } from '@/lib/finance/statements';

const VARIANT = { draft: 'warning', published: 'success', superseded: 'outline' } as const;

const StatementStatusBadge = ({ status }: { status: StatementStatus }) => {
  const t = useTranslations('finance.statements.status');
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
};

export default StatementStatusBadge;
