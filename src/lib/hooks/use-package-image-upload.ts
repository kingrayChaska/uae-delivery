'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const usePackageImageUpload = (customerId: string) => {
  const [path, setPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a JPEG, PNG or WebP image');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Image must be under 5MB');
      return;
    }

    setIsUploading(true);
    const supabase = createClient();
    // The path prefix (customerId/...) is what migration 0012's RLS policy
    // checks against auth.uid() — anything else is rejected at the storage
    // layer regardless of what the client sends.
    const objectPath = `${customerId}/${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('package-images')
      .upload(objectPath, file, { contentType: file.type });

    setIsUploading(false);

    if (uploadError) {
      setError('Upload failed. Please try again.');
      return;
    }

    setPath(objectPath);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clear = () => {
    setPath(null);
    setPreviewUrl(null);
    setError(null);
  };

  return { path, previewUrl, isUploading, error, upload, clear };
};
