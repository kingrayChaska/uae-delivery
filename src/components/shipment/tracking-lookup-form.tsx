'use client';

import { Search } from 'lucide-react';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import TurnstileWidget from '@/components/security/turnstile-widget';
import TrackingResult from '@/components/shipment/tracking-result';
import { useTrackingLookup } from '@/lib/hooks/use-tracking-lookup';

const TrackingLookupForm = () => {
  const { register, errors, isSubmitting, result, onSubmit, turnstile } = useTrackingLookup();

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate role="search">
        <div className="flex-1">
          <Label htmlFor="trackingNumber" className="sr-only">
            Tracking ID
          </Label>
          <Input
            id="trackingNumber"
            placeholder="Tracking ID, e.g. PL7K29X4"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-12 bg-white font-brand-mono text-lg tracking-widest uppercase placeholder:normal-case placeholder:tracking-normal sm:h-12"
            aria-invalid={Boolean(errors.trackingNumber) || undefined}
            {...register('trackingNumber')}
          />
          <FieldError message={errors.trackingNumber?.message} />
        </div>
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingText="Tracking…"
          disabled={!turnstile.ready}
          className="bg-brand-route text-brand-paper hover:bg-brand-route/90"
        >
          <Search aria-hidden />
          Track
        </Button>
      </form>
      <TurnstileWidget turnstile={turnstile} />

      <div aria-live="polite">
        {result && !result.success ? <FieldError message={result.error} /> : null}
        {result && result.success ? <TrackingResult tracking={result.tracking} history={result.history} /> : null}
      </div>
    </div>
  );
};

export default TrackingLookupForm;
