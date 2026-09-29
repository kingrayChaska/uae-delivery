import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

const TicketStatusBadge = ({ status }: { status: string }) => {
  const t = useTranslations('support.status');
  const known = (STATUSES as readonly string[]).includes(status);
  return (
    <Badge variant={status === 'open' ? 'default' : 'secondary'}>
      {known ? t(status as (typeof STATUSES)[number]) : status}
    </Badge>
  );
};

export default TicketStatusBadge;
