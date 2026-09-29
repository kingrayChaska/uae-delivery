import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';

import type { BatchStatus } from '@/lib/bulk/schemas';

const BATCH_VARIANT: Record<BatchStatus, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  processing: 'secondary',
  submitted: 'success',
  partially_failed: 'warning',
  failed: 'destructive',
};

const BatchStatusBadge = ({ status }: { status: BatchStatus }) => {
  const t = useTranslations('operator.bulk.status');
  return <Badge variant={BATCH_VARIANT[status]}>{t(status)}</Badge>;
};

export default BatchStatusBadge;
