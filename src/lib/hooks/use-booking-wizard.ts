'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { getRouteAction } from '@/lib/maps/actions';
import { BOOKING_STEP_FIELDS, bookingSchema } from '@/lib/shipment/schemas';
import { calculatePrice } from '@/lib/pricing/calculate';
import { validateBookingLocations } from '@/lib/shipment/booking-guards';

import type { BookingInput } from '@/lib/shipment/schemas';
import type { PriceBreakdown, PricingRule, Shipment } from '@/lib/types';
import type { RouteResult } from '@/lib/maps/types';

export const BOOKING_STEPS = ['pickup', 'dropoff', 'package', 'payment', 'review'] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

const emptyLocation = { address: '', lat: undefined, lng: undefined, contactName: '', contactPhone: '' };

export type BookingSubmitResult = { success: true; shipment: Shipment } | { success: false; error: string };

type UseBookingWizardOptions = {
  activeRule: PricingRule;
  // Customer self-booking and operator booking-on-behalf post to different
  // server actions (each with its own requireRole check) and land on
  // different detail pages — the wizard itself doesn't care which.
  onSubmit: (input: BookingInput) => Promise<BookingSubmitResult>;
  getSuccessPath: (shipmentId: string) => string;
  // Extra pre-submit guard, e.g. "a customer must be selected" for staff.
  validateBeforeSubmit?: () => string | null;
};

export const useBookingWizard = ({
  activeRule,
  onSubmit,
  getSuccessPath,
  validateBeforeSubmit,
}: UseBookingWizardOptions) => {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Stable for this booking attempt: every retry/double-click re-sends the
  // same id, so the server returns the original shipment (migration 0019).
  const [clientRequestId] = useState(() => crypto.randomUUID());
  // A ref updates synchronously, unlike isSubmitting — a second click in
  // the same frame is dropped before it sends anything.
  const inFlight = useRef(false);

  const form = useForm<BookingInput>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      pickup: emptyLocation,
      dropoff: emptyLocation,
      packageType: 'parcel',
      packageDescription: '',
      packageQuantity: 1,
      packageWeightKg: undefined,
      isFragile: false,
      packageImagePath: null,
      paymentMethod: 'card',
      // Loosened to Partial at the type level via zodResolver inference —
      // lat/lng start unset until AddressAutocomplete's onSelect fills them.
    } as unknown as BookingInput,
  });

  const step = BOOKING_STEPS[stepIndex];

  const calculateRoute = async () => {
    const { pickup, dropoff } = form.getValues();
    setRouteError(null);

    const locationError = validateBookingLocations(pickup, dropoff);
    if (locationError) {
      setRouteError(locationError);
      setRoute(null);
      return false;
    }

    setIsCalculatingRoute(true);

    const result = await getRouteAction({
      origin: { lat: pickup.lat, lng: pickup.lng },
      destination: { lat: dropoff.lat, lng: dropoff.lng },
    });

    setIsCalculatingRoute(false);

    if (!result.success) {
      setRouteError(result.error);
      setRoute(null);
      return false;
    }

    setRoute(result.route);
    return true;
  };

  const goNext = async () => {
    const fields = BOOKING_STEP_FIELDS[step];
    const valid = fields ? await form.trigger(fields) : true;
    if (!valid) return;

    // Route is calculated once, right after drop-off is confirmed, so the
    // review step can show a real price instead of re-fetching every time.
    if (step === 'dropoff') {
      const ok = await calculateRoute();
      if (!ok) return;
    }

    setStepIndex((index) => Math.min(index + 1, BOOKING_STEPS.length - 1));
  };

  const goBack = () => setStepIndex((index) => Math.max(index - 1, 0));

  const priceBreakdown: PriceBreakdown | null = route
    ? calculatePrice(route.distanceKm, route.durationMinutes, activeRule)
    : null;

  const onValidSubmit = async (input: BookingInput) => {
    const guardError = validateBeforeSubmit?.() ?? null;
    if (guardError) {
      setSubmitError(guardError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    inFlight.current = true;
    const result = await onSubmit({ ...input, clientRequestId });
    inFlight.current = false;
    setIsSubmitting(false);

    if (!result.success) {
      setSubmitError(result.error);
      return;
    }

    router.push(getSuccessPath(result.shipment.id));
  };

  // handleSubmit is invoked inside the event handler (not during render), so
  // the in-flight ref is only ever read at click time.
  const submit = (event?: React.BaseSyntheticEvent) => {
    if (inFlight.current) return;
    return form.handleSubmit(onValidSubmit)(event);
  };

  return {
    form,
    step,
    stepIndex,
    totalSteps: BOOKING_STEPS.length,
    goNext,
    goBack,
    isFirstStep: stepIndex === 0,
    isLastStep: stepIndex === BOOKING_STEPS.length - 1,
    route,
    routeError,
    isCalculatingRoute,
    priceBreakdown,
    submit,
    submitError,
    isSubmitting,
  };
};
