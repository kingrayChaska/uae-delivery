'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { useMarkCodCollected } from '@/lib/hooks/use-mark-cod-collected';

const MarkCodCollectedButton = ({ codTransactionId }: { codTransactionId: string }) => {
  const t = useTranslations('driver.cod');
  const { markCollected, isMarking, error } = useMarkCodCollected(codTransactionId);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={isMarking} onClick={markCollected}>
        {isMarking ? t('marking') : t('mark')}
      </Button>
      <FieldError message={error} />
    </div>
  );
};

export default MarkCodCollectedButton;
