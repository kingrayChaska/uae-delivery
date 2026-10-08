'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, CheckCircle2, ImageUp, LoaderCircle } from 'lucide-react';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';

type ProofPhotoFieldProps = {
  // The gallery input's id (the label points at it).
  id: string;
  label: string;
  hint: string;
  // The uploaded photo's storage path, once there is one.
  value: string | null;
  // Uploads the file; resolves the storage path, or null if it failed.
  onUpload: (file: File) => Promise<string | null>;
  onChange: (path: string | null) => void;
  isUploading: boolean;
  error: string | null;
};

// A required proof photo for a driver: taken with the camera there and
// then, or picked from the gallery (a photo taken a moment ago, or when
// the camera won't open in the browser). Shows what was attached.
const ProofPhotoField = ({ id, label, hint, value, onUpload, onChange, isUploading, error }: ProofPhotoFieldProps) => {
  const t = useTranslations('driver.proofPhoto');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    // The same file can be chosen again after a failed upload.
    input.value = '';
    if (!file) return;
    const path = await onUpload(file);
    onChange(path);
    setPreview(path ? URL.createObjectURL(file) : null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label} <span className="text-destructive" aria-hidden>*</span>
      </label>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border p-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable asset
            <img src={preview} alt={t('previewAlt')} className="size-16 shrink-0 rounded-md object-cover" />
          ) : null}
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {t('attached')}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              setPreview(null);
            }}
          >
            {t('replace')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={isUploading} onClick={() => cameraRef.current?.click()}>
            {isUploading ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Camera aria-hidden />}
            {t('take')}
          </Button>
          <Button type="button" variant="outline" disabled={isUploading} onClick={() => galleryRef.current?.click()}>
            <ImageUp aria-hidden />
            {t('choose')}
          </Button>
        </div>
      )}

      {/* capture opens the rear camera directly on phones; the other input opens the gallery / file picker. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => pick(event.currentTarget)}
      />
      <input
        ref={galleryRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-required
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => pick(event.currentTarget)}
      />

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {isUploading ? t('uploading') : hint}
      </p>
      <FieldError message={error} />
    </div>
  );
};

export default ProofPhotoField;
