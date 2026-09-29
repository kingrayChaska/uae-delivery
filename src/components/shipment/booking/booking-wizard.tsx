'use client';

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Headset, PackageCheck, Route, X } from 'lucide-react';
import Link from 'next/link';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import RouteMap from '@/components/maps/lazy-route-map';
import BookingProgress from '@/components/shipment/booking/booking-progress';
import LocationStep from '@/components/shipment/booking/location-step';
import PackageStep from '@/components/shipment/booking/package-step';
import ReviewStep from '@/components/shipment/booking/review-step';
import ServiceAreaNoticeCard from '@/components/shipment/booking/service-area-notice';
import { useBookingWizard } from '@/lib/hooks/use-booking-wizard';
import { splitAddress } from '@/lib/maps/location';
import { SUPPORTED_EMIRATES_TEXT, serviceAreaRequest } from '@/lib/service-areas/config';

import type { ReactNode } from 'react';
import type { MultiBookingInput } from '@/lib/shipment/schemas';
import type { CreateBookingResult } from '@/lib/shipment/actions';
import type { AccountType, DeliveryType, PricingRule } from '@/lib/types';
import type { ServiceArea } from '@/lib/service-areas/config';

type BookingWizardProps = {
  // Folder owner for package-photo uploads — must equal the signed-in
  // user's id to satisfy the package-images RLS insert policy (migration 0012).
  uploaderId: string;
  rules: Record<DeliveryType, PricingRule>;
  accountType: AccountType;
  onSubmit: (input: MultiBookingInput) => Promise<CreateBookingResult>;
  getSuccessPath: (result: Extract<CreateBookingResult, { success: true }>) => string;
  validateBeforeSubmit?: () => string | null;
  supportHref?: string;
  header?: ReactNode;
};

const BookingWizard = ({
  uploaderId,
  rules,
  accountType,
  onSubmit,
  getSuccessPath,
  validateBeforeSubmit,
  supportHref,
  header = null,
}: BookingWizardProps) => {
  const wizard = useBookingWizard({ rules, accountType, onSubmit, getSuccessPath, validateBeforeSubmit });
  const { form, step, drafts } = wizard;

  const pickup = useWatch({ control: form.control, name: 'pickup' });
  const dropoff = useWatch({ control: form.control, name: 'dropoff' });
  const hasPickup = typeof pickup?.lat === 'number' && typeof pickup?.lng === 'number';
  const hasDropoff = typeof dropoff?.lat === 'number' && typeof dropoff?.lng === 'number';
  const pickupPoint = hasPickup ? { lat: pickup.lat, lng: pickup.lng } : undefined;
  const dropoffPoint = hasDropoff ? { lat: dropoff.lat, lng: dropoff.lng } : undefined;
  // Only one map at a time: the route preview hides while a pin is being dropped.
  const [pinning, setPinning] = useState(false);
  const shipmentNumber = wizard.isEditingExisting
    ? drafts.findIndex((d) => d.key === wizard.editingKey) + 1
    : drafts.length + 1;
  const blockedByDistance = step === 'package' && wizard.distanceRestriction !== null;
  const maxDistanceKm = Math.max(rules.same_day.maxDistanceKm, rules.next_day.maxDistanceKm);
  const currency = rules.same_day.currency;

  // Where "Contact ParcelLink" goes: a support request already describing
  // the delivery when the page has one (customers), else the public contact
  // section.
  const contactHrefFor = (area: ServiceArea) => {
    if (!supportHref) return '/#contact';
    const { subject, message } = serviceAreaRequest(area, {
      pickup: hasPickup ? pickup.address : undefined,
      dropoff: hasDropoff ? dropoff.address : undefined,
    });
    return `${supportHref}?${new URLSearchParams({ subject, message })}`;
  };
  const locationBlocked = (step === 'pickup' && hasPickup) || (step === 'dropoff' && hasDropoff)
    ? wizard.locationArea(step as 'pickup' | 'dropoff').status !== 'supported'
    : false;
  // The server's verdict for the trip on screen (it can differ from the
  // instant one right on an emirate border).
  const serverBlock =
    wizard.serviceAreaBlock && pickupPoint && dropoffPoint && wizard.serviceAreaBlock.trip === wizard.tripKey(pickupPoint, dropoffPoint)
      ? wizard.serviceAreaBlock
      : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Book a delivery</h1>
        <p className="text-muted-foreground">
          {accountType === 'merchant'
            ? 'Merchant booking — flat-rate pricing. Weight is required for every shipment.'
            : 'Add one or more shipments, review the prices, then book them together.'}
        </p>
      </div>

      {header}
      <BookingProgress stepIndex={wizard.stepIndex} />

      <section
        aria-labelledby="wizard-heading"
        className="flex flex-col gap-6 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      >
        <h2 id="wizard-heading" className="sr-only">
          {step === 'review' ? 'Review booking' : `Shipment ${shipmentNumber}`}
        </h2>
        {step !== 'review' && drafts.length > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <PackageCheck className="size-4 text-primary" aria-hidden />
              {wizard.isEditingExisting ? `Editing shipment ${shipmentNumber}` : `Adding shipment ${shipmentNumber}`}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={wizard.cancelEditing}>
              <X aria-hidden />
              Cancel
            </Button>
          </div>
        ) : null}

        {/* key: re-mount the step (and its entrance animation) on change */}
        <div key={`${step}-${wizard.editingKey}`} className="animate-in fade-in-0 slide-in-from-right-2 duration-300 motion-reduce:animate-none">
          {step === 'pickup' ? (
            <LocationStep
              form={form}
              field="pickup"
              draftKey={wizard.editingKey}
              title="Where should we pick up?"
              description="Search for the building or area, drop a pin, or use your current location."
              locationLabel="Pickup location"
              contactNameLabel="Contact name"
              proximity={dropoffPoint}
              onPinModeChange={setPinning}
              contactHrefFor={contactHrefFor}
            />
          ) : null}

          {step === 'dropoff' && hasPickup ? (
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-muted/60 p-3 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pickup location</p>
                <p className="break-words font-medium">{splitAddress(pickup.address).title}</p>
                {pickup.building || pickup.unit ? (
                  <p className="text-muted-foreground">{[pickup.building, pickup.unit && `Unit ${pickup.unit}`].filter(Boolean).join(' · ')}</p>
                ) : null}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={wizard.goBack}>
                Change<span className="sr-only"> pickup location</span>
              </Button>
            </div>
          ) : null}

          {step === 'dropoff' ? (
            <LocationStep
              form={form}
              field="dropoff"
              draftKey={wizard.editingKey}
              title="Where is it going?"
              description={`We deliver within ${SUPPORTED_EMIRATES_TEXT}, up to ${maxDistanceKm} km from the pickup.`}
              locationLabel="Delivery location"
              contactNameLabel="Recipient name"
              proximity={pickupPoint}
              onPinModeChange={setPinning}
              contactHrefFor={contactHrefFor}
            />
          ) : null}

          {step === 'package' ? (
            <PackageStep
              form={form}
              uploaderId={uploaderId}
              isMerchant={wizard.isMerchant}
              quoteFor={wizard.quoteFor}
              rules={rules}
            />
          ) : null}

          {step === 'review' ? (
            <ReviewStep
              drafts={drafts}
              lastAddedKey={wizard.lastAddedKey}
              canAddMore={wizard.canAddMore}
              total={wizard.total}
              collectTotal={wizard.collectTotal}
              paymentMethod={wizard.paymentMethod}
              onPaymentMethodChange={wizard.setPaymentMethod}
              onEdit={wizard.editShipment}
              onRemove={wizard.removeShipment}
              onAddAnother={wizard.startNewShipment}
            />
          ) : null}
        </div>

        {step === 'dropoff' && serverBlock && !locationBlocked ? (
          <ServiceAreaNoticeCard area={serverBlock.area} end={serverBlock.end} contactHref={contactHrefFor(serverBlock.area)} />
        ) : null}

        {step === 'dropoff' && hasPickup && hasDropoff && !pinning && !locationBlocked && !serverBlock ? (
          <RouteMap
            pickup={pickupPoint}
            dropoff={dropoffPoint}
            route={wizard.route ?? undefined}
            className="h-56 w-full rounded-xl sm:h-64"
          />
        ) : null}

        {step === 'package' && wizard.route ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Route className="size-4 text-primary" aria-hidden />
            {wizard.route.distanceKm.toFixed(1)} km by road
          </p>
        ) : null}

        {blockedByDistance ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Long-distance delivery restricted
            </p>
            <p className="text-sm">{wizard.distanceRestriction}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={wizard.goBack}>
                <ArrowLeft aria-hidden />
                Change delivery address
              </Button>
              {supportHref ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={supportHref}>
                    <Headset aria-hidden />
                    Contact support
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {wizard.routeError && !blockedByDistance ? <FieldError message={wizard.routeError} /> : null}
        {wizard.submitError ? (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <FieldError message={wizard.submitError} />
          </div>
        ) : null}

        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur sm:static sm:m-0 sm:flex-row sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          {step === 'review' ? (
            <span />
          ) : (
            <Button type="button" variant="outline" onClick={wizard.goBack} disabled={step === 'pickup'}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
          )}

          {step === 'review' ? (
            <Button
              type="button"
              size="lg"
              onClick={wizard.submit}
              loading={wizard.isSubmitting}
              loadingText="Booking…"
              disabled={drafts.length === 0}
            >
              Confirm & book {drafts.length > 1 ? `${drafts.length} shipments` : ''} · {currency} {wizard.total.toFixed(2)}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={wizard.goNext}
              loading={wizard.isCalculatingRoute}
              loadingText="Calculating route…"
              disabled={blockedByDistance || locationBlocked || (step === 'dropoff' && serverBlock !== null)}
            >
              {step === 'package' ? (wizard.isEditingExisting ? 'Save shipment' : 'Add to booking') : 'Continue'}
              <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
};

export default BookingWizard;
