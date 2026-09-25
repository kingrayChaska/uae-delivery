'use client';

import { useState } from 'react';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import { useQrScanner } from '@/lib/hooks/use-qr-scanner';

type QrScannerProps = {
  onScan: (value: string) => void;
};

const QrScanner = ({ onScan }: QrScannerProps) => {
  const { videoRef, isSupported, isScanning, error, start, stop } = useQrScanner(onScan);
  const [manualValue, setManualValue] = useState('');

  if (!isSupported) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          QR camera scanning isn&apos;t supported on this browser — enter the code shown under the
          shipment&apos;s QR label instead.
        </p>
        <div className="flex gap-2">
          <Input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            placeholder="QR code value"
          />
          <Button type="button" onClick={() => onScan(manualValue)} disabled={!manualValue}>
            Verify
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
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" variant="outline" size="sm" onClick={isScanning ? stop : start}>
        {isScanning ? 'Stop Scanning' : 'Scan QR Code'}
      </Button>
    </div>
  );
};

export default QrScanner;
