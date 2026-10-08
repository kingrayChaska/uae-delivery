'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { shrinkPhoto } from '@/lib/images/shrink-photo';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // matches the bucket limit (migration 0018)
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const usePodUpload = (shipmentId: string) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // photo: delivery; cancel / return: the proof for ending a delivery
  // early (migration 0037); signature: the recipient's signature.
  const upload = async (
    original: Blob,
    prefix: 'photo' | 'cancel' | 'return' | 'signature',
    originalExtension: string,
  ): Promise<string | null> => {
    setError(null);

    // Early, friendly feedback only — the storage bucket itself enforces
    // the same type and size limits on every upload (migration 0018).
    if (!ACCEPTED_TYPES.includes(original.type)) {
      setError('booking.photo.errors.type');
      return null;
    }

    setIsUploading(true);
    const file = prefix === 'signature' ? original : await shrinkPhoto(original);
    const extension = file === original ? originalExtension : 'jpg';
    if (file.size > MAX_FILE_BYTES) {
      setIsUploading(false);
      setError('booking.photo.errors.size');
      return null;
    }

    const supabase = createClient();
    // Path prefix (shipmentId/...) is what migration 0013's RLS checks
    // against the shipment's driver_id — anything else is rejected at the
    // storage layer regardless of what the client sends.
    const path = `${shipmentId}/${prefix}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from('proof-of-delivery').upload(path, file);

    setIsUploading(false);

    if (uploadError) {
      setError('booking.photo.errors.failed');
      return null;
    }

    return path;
  };

  return { upload, isUploading, error };
};
