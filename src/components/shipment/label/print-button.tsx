'use client';

import { useTranslations } from 'next-intl';
import { Printer } from 'lucide-react';

import Button from '@/components/ui/button';

// Opens the browser's print dialog, which also offers "Save as PDF".
// `label` defaults to the shipment label's wording.
const PrintButton = ({ label }: { label?: string }) => {
  const t = useTranslations('shipments.label');
  return (
    <Button type="button" size="lg" className="print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden />
      {label ?? t('printOrDownload')}
    </Button>
  );
};

export default PrintButton;
