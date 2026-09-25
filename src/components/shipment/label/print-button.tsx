'use client';

import Button from '@/components/ui/button';

const PrintButton = () => {
  return (
    <Button type="button" className="print:hidden" onClick={() => window.print()}>
      Print label
    </Button>
  );
};

export default PrintButton;
