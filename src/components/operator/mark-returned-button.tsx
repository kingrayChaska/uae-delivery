'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { markReturnedAction } from '@/lib/dispatch/actions';

const MarkReturnedButton = ({ shipmentId }: { shipmentId: string }) => {
  const t = useTranslations('operator.shipmentDetail');
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setIsPending(true);
    setError(null);
    const result = await markReturnedAction(shipmentId);
    setIsPending(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled={isPending} onClick={handleClick}>
        {isPending ? t('marking') : t('markReturned')}
      </Button>
      {error ? <FieldError message={error} /> : null}
    </div>
  );
};

export default MarkReturnedButton;
