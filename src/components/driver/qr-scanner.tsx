'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import FieldError from '@/components/ui/field-error';
import { useQrScanner } from '@/lib/hooks/use-qr-scanner';

type QrScannerProps = {
  onScan: (value: string) => void;
};

const QrScanner = ({ onScan }: QrScannerProps) => {
  const t = useTranslations('driver.qr');
  const { videoRef, isSupported, isScanning, error, start, stop } = useQrScanner(onScan);
  const [manualValue, setManualValue] = useState('');

  if (!isSupported) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{t('unsupported')}</p>
        <div className="flex gap-2">
          <Input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            placeholder={t('manualPlaceholder')}
            aria-label={t('manualPlaceholder')}
            dir="ltr"
            className="rtl:text-right"
          />
          <Button type="button" onClick={() => onScan(manualValue)} disabled={!manualValue}>
            {t('verify')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {isScanning ? (
        <video ref={videoRef} className="aspect-video w-full rounded-md bg-black" muted playsInline />
      ) : null}
      <FieldError message={error} />
      <Button type="button" variant="outline" size="sm" onClick={isScanning ? stop : start}>
        {isScanning ? t('stop') : t('scan')}
      </Button>
    </div>
  );
};

export default QrScanner;
