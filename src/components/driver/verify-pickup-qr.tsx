'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import QrScanner from '@/components/driver/qr-scanner';
import { verifyShipmentQrAction } from '@/lib/driver/verify-qr-action';

// Purely informational — spec section 34 lists scanning as one of the
// pickup capabilities, but doesn't gate "Confirm Pickup" on it (unlike
// proof of delivery, where at least one verification IS required). This
// gives the driver a quick "yes, this is the right package" check.
const VerifyPickupQr = ({ shipmentId }: { shipmentId: string }) => {
  const t = useTranslations('driver.qr');
  const [result, setResult] = useState<'match' | 'mismatch' | null>(null);

  const handleScan = async (value: string) => {
    const ok = await verifyShipmentQrAction(shipmentId, value);
    setResult(ok ? 'match' : 'mismatch');
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">{t('verifyTitle')}</p>
      <QrScanner onScan={handleScan} />
      {result === 'match' ? <p className="text-sm text-success">{t('verified')}</p> : null}
      {result === 'mismatch' ? <p className="text-sm text-destructive">{t('mismatch')}</p> : null}
    </div>
  );
};

export default VerifyPickupQr;
