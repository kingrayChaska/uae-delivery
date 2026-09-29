'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';

const PrintButton = () => {
  const t = useTranslations('shipments.label');
  return (
    <Button type="button" className="print:hidden" onClick={() => window.print()}>
      {t('print')}
    </Button>
  );
};

export default PrintButton;
