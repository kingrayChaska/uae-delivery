'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import Button from '@/components/ui/button';
import { reconcileCodAction, remitCodAction } from '@/lib/cod/actions';

const CodActionsCell = ({ codTransactionId, status }: { codTransactionId: string; status: string }) => {
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
          Reconcile
        </Button>
      ) : null}
      {status === 'reconciled' ? (
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => run(remitCodAction)}>
          Mark Remitted
        </Button>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
};

export default CodActionsCell;
