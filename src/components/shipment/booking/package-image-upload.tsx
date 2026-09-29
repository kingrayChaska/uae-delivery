'use client';

import { useEffect, useRef } from 'react';

import Label from '@/components/ui/label';
import Button from '@/components/ui/button';
import { usePackageImageUpload } from '@/lib/hooks/use-package-image-upload';

type PackageImageUploadProps = {
  customerId: string;
  onChange: (path: string | null) => void;
};

const PackageImageUpload = ({ customerId, onChange }: PackageImageUploadProps) => {
  const { path, previewUrl, isUploading, error, upload, clear } = usePackageImageUpload(customerId);

  // Reports the uploaded path up to the booking form once the upload
  // resolves — a plain callback ref would fire during render, which React
  // (correctly) treats as a purity violation, so this waits for the
  // committed "path changed" effect instead.
  // Skips the initial mount: re-opening a shipment that already has a photo
  // must not report "no photo" and wipe it.
  const reported = useRef(path);
  useEffect(() => {
    if (reported.current === path) return;
    reported.current = path;
    onChange(path);
    // onChange identity isn't stable across renders in the parent form —
    // only re-run when the uploaded path itself actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="package-image">Package photo (optional)</Label>

      {previewUrl ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a remote/optimizable image */}
          <img src={previewUrl} alt="Package preview" className="size-16 rounded-md object-cover" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              clear();
              onChange(null);
            }}
          >
            Remove
          </Button>
        </div>
      ) : (
        <input
          id="package-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isUploading}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await upload(file);
          }}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
        />
      )}

      {isUploading ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
};

export default PackageImageUpload;
