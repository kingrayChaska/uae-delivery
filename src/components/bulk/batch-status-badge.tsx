import Badge from '@/components/ui/badge';

import type { BatchStatus } from '@/lib/bulk/schemas';

const BATCH_STATUS: Record<BatchStatus, { label: string; variant: 'secondary' | 'success' | 'warning' | 'destructive' }> = {
  processing: { label: 'Processing', variant: 'secondary' },
  submitted: { label: 'Submitted', variant: 'success' },
  partially_failed: { label: 'Some rows failed', variant: 'warning' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const BatchStatusBadge = ({ status }: { status: BatchStatus }) => {
  const { label, variant } = BATCH_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
};

export default BatchStatusBadge;
