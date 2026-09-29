'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { reconcileCodAction, remitCodAction } from '@/lib/cod/actions';

const CodActionsCell = ({ codTransactionId, status }: { codTransactionId: string; status: string }) => {
  const t = useTranslations('operator.cod');
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: (id: string) => Promise<{ success: true } | { success: false; error: string }>) => {
    setIsPending(true);
    setError(null);
    const result = await action(codTransactionId);
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {status === 'collected' ? (
        <Button type="button" size="sm" disabled={isPending} onClick={() => run(reconcileCodAction)}>
          {t('reconcile')}
        </Button>
      ) : null}
      {status === 'reconciled' ? (
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => run(remitCodAction)}>
          {t('remit')}
        </Button>
      ) : null}
      <FieldError message={error} />
    </div>
  );
};

export default CodActionsCell;
