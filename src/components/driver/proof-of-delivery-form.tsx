'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banknote } from 'lucide-react';

import Button from '@/components/ui/button';
import Checkbox from '@/components/ui/checkbox';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import ProofPhotoField from '@/components/driver/proof-photo-field';
import SignaturePad from '@/components/driver/signature-pad';
import QrScanner from '@/components/driver/qr-scanner';
import { usePodUpload } from '@/lib/hooks/use-pod-upload';
import { requestDeliveryOtpAction, submitProofOfDeliveryAction } from '@/lib/driver/actions';
import { proofOfDeliverySchema } from '@/lib/driver/schemas';
import { useFormat } from '@/i18n/hooks';

type ProofOfDeliveryFormProps = {
  shipmentId: string;
  // The amount to collect from the recipient (0 = nothing to collect).
  codToCollect: number;
  currency: string;
};

// A delivery photo and a note, plus the COD confirmation when there's
// money to collect, is all a driver needs. Signature, OTP and QR stay
// available as optional extra proof.
const ProofOfDeliveryForm = ({ shipmentId, codToCollect, currency }: ProofOfDeliveryFormProps) => {
  const t = useTranslations('driver.pod');
  const format = useFormat();
  const router = useRouter();
  const { upload, isUploading, error: uploadError } = usePodUpload(shipmentId);
  const collectsCod = codToCollect > 0;

  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [codCollected, setCodCollected] = useState(false);
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignatureCapture = async (blob: Blob) => {
    const path = await upload(blob, 'signature', 'png');
    setSignaturePath(path);
  };

  const handleSubmit = async () => {
    setError(null);

    const input = {
      shipmentId,
      photoPath,
      signaturePath,
      otpCode: otpCode || null,
      qrToken,
      notes,
      collectsCod,
      codCollected,
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

      <ProofPhotoField
        id="podPhoto"
        label={t('photo')}
        hint={t('photoHint')}
        value={photoPath}
        onUpload={(file) => upload(file, 'photo', file.name.split('.').pop() ?? 'jpg')}
        onChange={setPhotoPath}
        isUploading={isUploading}
        error={uploadError}
      />

      {collectsCod ? (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-secondary/40 p-3">
          <p className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Banknote className="size-4 text-primary" aria-hidden />
              {t('codTitle')}
            </span>
            <span className="font-brand-mono text-lg font-semibold">{format.money(codToCollect, currency)}</span>
          </p>
          <label htmlFor="codCollected" className="flex items-start gap-3 text-sm">
            <Checkbox
              id="codCollected"
              className="mt-0.5 size-5"
              checked={codCollected}
              onChange={(event) => setCodCollected(event.target.checked)}
              aria-required
            />
            <span>{t('codConfirm', { amount: format.money(codToCollect, currency) })}</span>
          </label>
        </div>
      ) : null}

      <details className="group rounded-md border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none">{t('moreProof')}</summary>
        <div className="mt-3 flex flex-col gap-4">
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
        </div>
      </details>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="podNotes">
          {t('notes')} <span className="text-destructive" aria-hidden>*</span>
        </Label>
        <textarea
          id="podNotes"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('notesPlaceholder')}
          aria-required
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
        />
      </div>

      {error ? <FieldError message={error} /> : null}

      <Button type="button" onClick={handleSubmit} disabled={isSubmitting || isUploading}>
        {isSubmitting ? t('completing') : t('complete')}
      </Button>
    </div>
  );
};

export default ProofOfDeliveryForm;
