'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { reconcileCodAction, remitCodAction } from '@/lib/cod/actions';

type CodActionsCellProps = {
  codTransactionId: string;
  status: string;
  // Set for a recorded (verified) collection: that cash is settled by
  // recording the driver's remittance (migration 0042), not row by row.
  settleHref?: string | null;
};

const CodActionsCell = ({ codTransactionId, status, settleHref = null }: CodActionsCellProps) => {
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
      {status === 'collected' && settleHref ? (
        <Button asChild size="sm" variant="outline">
          <Link href={settleHref}>{t('settleWithRemittance')}</Link>
        </Button>
      ) : null}
      {status === 'collected' && !settleHref ? (
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
