'use client';

import { useWatch } from 'react-hook-form';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import RouteMap from '@/components/maps/lazy-route-map';
import BookingProgress from '@/components/shipment/booking/booking-progress';
import LocationStep from '@/components/shipment/booking/location-step';
import PackageStep from '@/components/shipment/booking/package-step';
import PaymentStep from '@/components/shipment/booking/payment-step';
import ReviewStep from '@/components/shipment/booking/review-step';
import { useBookingWizard } from '@/lib/hooks/use-booking-wizard';

import type { ReactNode } from 'react';
import type { BookingInput } from '@/lib/shipment/schemas';
import type { BookingSubmitResult } from '@/lib/hooks/use-booking-wizard';
import type { PricingRule } from '@/lib/types';

type BookingWizardProps = {
  // Folder owner for package-photo uploads — must equal the signed-in
  // user's id to satisfy the package-images RLS insert policy (migration 0012).
  uploaderId: string;
  activeRule: PricingRule;
  onSubmit: (input: BookingInput) => Promise<BookingSubmitResult>;
  getSuccessPath: (shipmentId: string) => string;
  validateBeforeSubmit?: () => string | null;
  header?: ReactNode;
};

const BookingWizard = ({
  uploaderId,
  activeRule,
  onSubmit,
  getSuccessPath,
  validateBeforeSubmit,
  header = null,
}: BookingWizardProps) => {
  const {
    form,
    step,
    stepIndex,
    goNext,
    goBack,
    isFirstStep,
    isLastStep,
    route,
    routeError,
    isCalculatingRoute,
    priceBreakdown,
    submit,
    submitError,
    isSubmitting,
  } = useBookingWizard({ activeRule, onSubmit, getSuccessPath, validateBeforeSubmit });

  const pickup = useWatch({ control: form.control, name: 'pickup' });
  const dropoff = useWatch({ control: form.control, name: 'dropoff' });
  const hasPickup = typeof pickup.lat === 'number' && typeof pickup.lng === 'number';
  const hasDropoff = typeof dropoff.lat === 'number' && typeof dropoff.lng === 'number';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      {header}
      <BookingProgress stepIndex={stepIndex} />

      {step === 'pickup' ? (
        <LocationStep form={form} field="pickup" title="Where should we pick up?" addressLabel="Pickup address" contactNameLabel="Contact name" />
      ) : null}

      {step === 'dropoff' ? (
        <LocationStep form={form} field="dropoff" title="Where is this going?" addressLabel="Delivery address" contactNameLabel="Recipient name" />
      ) : null}

      {step === 'package' ? <PackageStep form={form} customerId={uploaderId} /> : null}
      {step === 'payment' ? <PaymentStep form={form} /> : null}
      {step === 'review' ? <ReviewStep form={form} priceBreakdown={priceBreakdown} /> : null}

      {(hasPickup || hasDropoff) && step !== 'package' && step !== 'payment' ? (
        <RouteMap
          pickup={hasPickup ? { lat: pickup.lat, lng: pickup.lng } : undefined}
          dropoff={hasDropoff ? { lat: dropoff.lat, lng: dropoff.lng } : undefined}
          route={route ?? undefined}
          className="h-64 w-full rounded-md"
        />
      ) : null}

      {routeError ? <FieldError message={routeError} /> : null}
      {submitError ? <FieldError message={submitError} /> : null}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={goBack} disabled={isFirstStep}>
          Back
        </Button>

        {isLastStep ? (
          <Button type="button" onClick={submit} disabled={isSubmitting}>
            {isSubmitting ? 'Booking…' : 'Confirm & Book'}
          </Button>
        ) : (
          <Button type="button" onClick={goNext} disabled={isCalculatingRoute}>
            {isCalculatingRoute ? 'Calculating route…' : 'Next'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default BookingWizard;
