'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useTurnstile } from '@/lib/hooks/use-turnstile';

import { trackShipmentAction } from '@/lib/shipment/actions';
import { trackingLookupSchema } from '@/lib/shipment/schemas';

import type { TrackShipmentResult } from '@/lib/shipment/actions';
import type { TrackingLookupInput } from '@/lib/shipment/schemas';

export const useTrackingLookup = () => {
  const turnstile = useTurnstile();
  const [result, setResult] = useState<TrackShipmentResult | null>(null);

  const form = useForm<TrackingLookupInput>({
    resolver: zodResolver(trackingLookupSchema),
    defaultValues: { trackingNumber: '' },
  });

  const onSubmit = form.handleSubmit(async (input) => {
    setResult(await trackShipmentAction(input, turnstile.token));
    turnstile.reset();
  });

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    result,
    onSubmit,
    turnstile,
  };
};
