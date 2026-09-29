import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';

type ExportLinkProps = {
  type: 'shipments' | 'drivers' | 'revenue' | 'customers' | 'daily' | 'cod';
  from: string;
  to: string;
  label?: string;
};

const ExportLink = ({ type, from, to, label }: ExportLinkProps) => {
  const t = useTranslations('manager.reports');
  const params = new URLSearchParams({ type, from, to });
  return (
    <Button asChild size="sm" variant="outline">
      <a href={`/api/manager/reports/export?${params.toString()}`} download>
        {label ?? t('export')}
      </a>
    </Button>
  );
};

export default ExportLink;
