'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import SignaturePad from '@/components/driver/signature-pad';
import QrScanner from '@/components/driver/qr-scanner';
import { usePodUpload } from '@/lib/hooks/use-pod-upload';
import { requestDeliveryOtpAction, submitProofOfDeliveryAction } from '@/lib/driver/actions';
import { proofOfDeliverySchema } from '@/lib/driver/schemas';

type ProofOfDeliveryFormProps = {
  shipmentId: string;
};

const ProofOfDeliveryForm = ({ shipmentId }: ProofOfDeliveryFormProps) => {
  const t = useTranslations('driver.pod');
  const router = useRouter();
  const { upload, isUploading } = usePodUpload(shipmentId);

  const [recipientName, setRecipientName] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoSelect = async (file: File) => {
    const path = await upload(file, 'photo', file.name.split('.').pop() ?? 'jpg');
    setPhotoPath(path);
  };

  const handleSignatureCapture = async (blob: Blob) => {
    const path = await upload(blob, 'signature', 'png');
    setSignaturePath(path);
  };

  const handleSubmit = async () => {
    setError(null);

    const input = {
      shipmentId,
      recipientName,
      photoPath,
      signaturePath,
      otpCode: otpCode || null,
      qrToken,
      notes,
    };

    const parsed = proofOfDeliverySchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'validation.invalid');
      return;
    }

    setIsSubmitting(true);
    const result = await submitProofOfDeliveryAction(parsed.data);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <h3 className="font-medium">{t('title')}</h3>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipientName">{t('recipientName')}</Label>
        <Input id="recipientName" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="podPhoto">{t('photo')}</Label>
        {photoPath ? (
          <p className="text-sm text-success">{t('photoAttached')}</p>
        ) : (
          <input
            id="podPhoto"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await handlePhotoSelect(file);
            }}
            className="text-sm text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t('signature')}</Label>
        {signaturePath ? (
          <p className="text-sm text-success">{t('signatureCaptured')}</p>
        ) : (
          <SignaturePad onCapture={handleSignatureCapture} onClear={() => setSignaturePath(null)} />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t('otp')}</Label>
        {!otpRequested ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={async () => {
              await requestDeliveryOtpAction(shipmentId);
              setOtpRequested(true);
            }}
          >
            {t('sendCode')}
          </Button>
        ) : (
          <Input
            value={otpCode}
            onChange={(event) => setOtpCode(event.target.value)}
            placeholder={t('codePlaceholder')}
            aria-label={t('otp')}
            maxLength={4}
            inputMode="numeric"
            dir="ltr"
            className="rtl:text-right"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t('qr')}</Label>
        <QrScanner onScan={setQrToken} />
        {qrToken ? <p className="text-sm text-success">{t('qrCaptured')}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="podNotes">{t('notes')}</Label>
        <Input id="podNotes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>

      {error ? <FieldError message={error} /> : null}

      <Button type="button" onClick={handleSubmit} disabled={isSubmitting || isUploading}>
        {isSubmitting ? t('completing') : t('complete')}
      </Button>
    </div>
  );
};

export default ProofOfDeliveryForm;
