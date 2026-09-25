'use client';

import Button from '@/components/ui/button';
import { useMarkCodCollected } from '@/lib/hooks/use-mark-cod-collected';

const MarkCodCollectedButton = ({ codTransactionId }: { codTransactionId: string }) => {
  const { markCollected, isMarking, error } = useMarkCodCollected(codTransactionId);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={isMarking} onClick={markCollected}>
        {isMarking ? 'Marking…' : 'Mark Collected'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
};

export default MarkCodCollectedButton;
