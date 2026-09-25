'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // matches the bucket limit (migration 0018)
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const usePodUpload = (shipmentId: string) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: Blob, prefix: 'photo' | 'signature', extension: string): Promise<string | null> => {
    setError(null);

    // Early, friendly feedback only — the storage bucket itself enforces
    // the same type and size limits on every upload (migration 0018).
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a JPEG, PNG or WebP image');
      return null;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Image must be under 5MB');
      return null;
    }

    setIsUploading(true);

    const supabase = createClient();
    // Path prefix (shipmentId/...) is what migration 0013's RLS checks
    // against the shipment's driver_id — anything else is rejected at the
    // storage layer regardless of what the client sends.
    const path = `${shipmentId}/${prefix}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from('proof-of-delivery').upload(path, file);

    setIsUploading(false);

    if (uploadError) {
      setError('Upload failed. Please try again.');
      return null;
    }

    return path;
  };

  return { upload, isUploading, error };
};
