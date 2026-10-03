'use client';

import { useTranslations } from 'next-intl';
import { Printer } from 'lucide-react';

import Button from '@/components/ui/button';

const PrintButton = () => {
  const t = useTranslations('shipments.label');
  return (
    <Button type="button" size="lg" className="print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden />
      {t('printOrDownload')}
    </Button>
  );
};

export default PrintButton;
