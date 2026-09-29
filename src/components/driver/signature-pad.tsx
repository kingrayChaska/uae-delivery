'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import { useSignaturePad } from '@/lib/hooks/use-signature-pad';

type SignaturePadProps = {
  onCapture: (blob: Blob) => void;
  onClear: () => void;
};

const SignaturePad = ({ onCapture, onClear }: SignaturePadProps) => {
  const t = useTranslations('driver.pod');
  const { canvasRef, hasSignature, onPointerDown, onPointerMove, onPointerUp, clear, toBlob } =
    useSignaturePad();

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={140}
        className="touch-none rounded-md border bg-white"
        role="img"
        aria-label={t('signaturePad')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={async () => {
          onPointerUp();
          const blob = await toBlob();
          if (blob) onCapture(blob);
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            clear();
            onClear();
          }}
          disabled={!hasSignature}
        >
          {t('clear')}
        </Button>
      </div>
    </div>
  );
};

export default SignaturePad;
