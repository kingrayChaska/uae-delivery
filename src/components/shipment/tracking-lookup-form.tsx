'use client';

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
    <div className="flex w-full max-w-md flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
        <div className="flex-1">
          <Label htmlFor="trackingNumber" className="sr-only">
            Tracking number
          </Label>
          <Input
            id="trackingNumber"
            placeholder="DLV-20260920-000184"
            className="font-brand-mono"
            {...register('trackingNumber')}
          />
          <FieldError message={errors.trackingNumber?.message} />
        </div>
        <Button type="submit" disabled={isSubmitting || !turnstile.ready} className="bg-brand-route text-brand-paper hover:bg-brand-route/90">
          {isSubmitting ? 'Tracking…' : 'Track'}
        </Button>
      </form>
      <TurnstileWidget containerRef={turnstile.containerRef} enabled={turnstile.enabled} loadError={turnstile.loadError} />

      {result && !result.success ? <FieldError message={result.error} /> : null}
      {result && result.success ? (
        <TrackingResult tracking={result.tracking} history={result.history} />
      ) : null}
    </div>
  );
};

export default TrackingLookupForm;
