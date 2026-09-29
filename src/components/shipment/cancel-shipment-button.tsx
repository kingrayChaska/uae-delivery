'use client';

import { XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import ConfirmButton from '@/components/ui/confirm-button';
import { useCancelShipment } from '@/lib/hooks/use-cancel-shipment';

const CancelShipmentButton = ({ shipmentId }: { shipmentId: string }) => {
  const t = useTranslations('customer.cancel');
  const { cancel, isCancelling, error } = useCancelShipment(shipmentId);

  return (
    <ConfirmButton
      variant="outline"
      className="border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
      title={t('title')}
      description={t('description')}
      confirmLabel={t('confirm')}
      cancelLabel={t('keep')}
      confirmVariant="destructive"
      isPending={isCancelling}
      error={error}
      onConfirm={cancel}
    >
      <XCircle aria-hidden />
      {t('button')}
    </ConfirmButton>
  );
};

export default CancelShipmentButton;
