'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { getRouteAction } from '@/lib/maps/actions';
import { checkServiceAreasAction } from '@/lib/service-areas/actions';
import { classifyServiceArea } from '@/lib/service-areas/config';
import { BOOKING_STEP_FIELDS, MAX_SHIPMENTS_PER_BOOKING, bookingShipmentSchema } from '@/lib/shipment/schemas';
import { calculateShipmentPrice, sumPrices } from '@/lib/pricing/calculate';
import { BOOKING_ERRORS, distanceLimitMessage, validateBookingLocations } from '@/lib/shipment/booking-guards';
import { DELIVERY_TYPES } from '@/lib/types';

import type { BookingShipmentInput, MultiBookingInput } from '@/lib/shipment/schemas';
import type { CreateBookingResult } from '@/lib/shipment/actions';
import type { AccountType, DeliveryType, PaymentMethod, PriceBreakdown, PricingRule } from '@/lib/types';
import type { RouteResult } from '@/lib/maps/types';
import type { LocationEnd, ServiceArea } from '@/lib/service-areas/config';

// A location the server found outside the normal service area, for the trip
// it was checked for (so it stops showing once either end changes).
export type ServiceAreaBlock = { end: LocationEnd; area: ServiceArea; trip: string };

const tripKey = (pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }) =>
  `${pickup.lat},${pickup.lng}|${dropoff.lat},${dropoff.lng}`;

// Steps for the shipment being edited; 'review' is the booking basket.
export const BOOKING_STEPS = ['pickup', 'dropoff', 'package', 'review'] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export type ShipmentDraft = {
  // Doubles as the shipment's clientRequestId (duplicate-submit protection).
  key: string;
  values: BookingShipmentInput;
  route: RouteResult;
  price: PriceBreakdown;
};

const emptyLocation = { address: '', lat: undefined, lng: undefined, contactName: '', contactPhone: '' };

const newShipmentValues = (pickup?: BookingShipmentInput['pickup']) =>
  ({
    pickup: pickup ?? emptyLocation,
    dropoff: emptyLocation,
    deliveryType: 'same_day',
    packageType: 'parcel',
    packageDescription: '',
    packageQuantity: 1,
    packageWeightKg: undefined,
    packageLengthCm: undefined,
    packageWidthCm: undefined,
    packageHeightCm: undefined,
    isFragile: false,
    packageImagePath: null,
    recipientPaymentType: 'prepaid',
    codAmount: undefined,
    productValue: undefined,
    // lat/lng start unset until the location picker fills them.
  }) as unknown as BookingShipmentInput;

type UseBookingWizardOptions = {
  // The active rule per delivery type for this customer's account type.
  rules: Record<DeliveryType, PricingRule>;
  accountType: AccountType;
  // Customer self-booking and staff booking-on-behalf post to different
  // server actions (each with its own requireRole check) and land on
  // different pages — the wizard itself doesn't care which.
  onSubmit: (input: MultiBookingInput) => Promise<CreateBookingResult>;
  getSuccessPath: (result: Extract<CreateBookingResult, { success: true }>) => string;
  // Extra pre-submit guard, e.g. "a customer must be selected" for staff.
  validateBeforeSubmit?: () => string | null;
};

export const useBookingWizard = ({
  rules,
  accountType,
  onSubmit,
  getSuccessPath,
  validateBeforeSubmit,
}: UseBookingWizardOptions) => {
  const router = useRouter();
  const [step, setStep] = useState<BookingStep>('pickup');
  const [drafts, setDrafts] = useState<ShipmentDraft[]>([]);
  // The draft being edited, or a fresh key for a new shipment.
  const [editingKey, setEditingKey] = useState(() => crypto.randomUUID());
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [serviceAreaBlock, setServiceAreaBlock] = useState<ServiceAreaBlock | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  // Stable for this booking attempt: every retry/double-click re-sends the
  // same id, so the server returns the original booking (migrations 0019/0020).
  const [clientRequestId] = useState(() => crypto.randomUUID());
  // A ref updates synchronously, unlike isSubmitting — a second click in
  // the same frame is dropped before it sends anything.
  const inFlight = useRef(false);

  const form = useForm<BookingShipmentInput>({
    resolver: zodResolver(bookingShipmentSchema),
    defaultValues: newShipmentValues(),
    mode: 'onTouched',
  });

  const isMerchant = accountType === 'merchant';
  const isEditingExisting = drafts.some((draft) => draft.key === editingKey);

  // Live quote for every delivery type, so the package step can show both
  // prices side by side. Same engine the server uses.
  const quoteFor = (deliveryType: DeliveryType, values = form.getValues()): PriceBreakdown | null =>
    route
      ? calculateShipmentPrice({
          rule: rules[deliveryType],
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          weightKg: Number.isFinite(values.packageWeightKg) ? values.packageWeightKg : null,
          recipientPaymentType: values.recipientPaymentType,
          shipmentQuantity: values.packageQuantity,
          codAmount: values.codAmount,
        })
      : null;

  // Blocked for every service = the trip itself is too long.
  const distanceRestriction = (() => {
    if (!route) return null;
    const quotes = DELIVERY_TYPES.map((type) => quoteFor(type)).filter((q): q is PriceBreakdown => q !== null);
    if (quotes.length === 0 || !quotes.every((q) => q.exceedsDistanceLimit)) return null;
    const limit = Math.max(...quotes.map((q) => q.maxDistanceKm));
    return distanceLimitMessage(quotes[0].distanceKm, limit);
  })();

  // Instant verdict from the place Mapbox described when the location was
  // chosen. The server re-checks from the coordinates (calculateRoute, and
  // again when booking).
  const locationArea = (end: LocationEnd, values = form.getValues()) => classifyServiceArea(values[end]?.place);

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
    const trip = {
      origin: { lat: pickup.lat, lng: pickup.lng },
      destination: { lat: dropoff.lat, lng: dropoff.lng },
    };
    // The server's own emirate check — the one the booking will get — runs
    // alongside the route, so prices only appear for bookable trips.
    const [result, areas] = await Promise.all([getRouteAction(trip), checkServiceAreasAction(trip)]);
    setIsCalculatingRoute(false);

    if (!areas.success) {
      setRouteError(areas.error);
      setRoute(null);
      return false;
    }
    const blockedEnd = (['pickup', 'dropoff'] as const).find((end) => areas.areas[end].status !== 'supported');
    if (blockedEnd) {
      setServiceAreaBlock({ end: blockedEnd, area: areas.areas[blockedEnd], trip: tripKey(pickup, dropoff) });
      setRoute(null);
      return false;
    }
    setServiceAreaBlock(null);

    if (!result.success) {
      setRouteError(result.error);
      setRoute(null);
      return false;
    }

    setRoute(result.route);
    return true;
  };

  const saveDraft = () => {
    if (!route) return false;
    const values = form.getValues();

    if (isMerchant && !(Number(values.packageWeightKg) > 0)) {
      form.setError('packageWeightKg', { message: BOOKING_ERRORS.weightRequired });
      return false;
    }

    const price = quoteFor(values.deliveryType, values);
    if (!price) return false;
    if (price.exceedsDistanceLimit) {
      setRouteError(distanceLimitMessage(price.distanceKm, price.maxDistanceKm));
      return false;
    }

    const draft: ShipmentDraft = { key: editingKey, values, route, price };
    setDrafts((current) =>
      current.some((d) => d.key === editingKey)
        ? current.map((d) => (d.key === editingKey ? draft : d))
        : [...current, draft],
    );
    setLastAddedKey(editingKey);
    return true;
  };

  const goNext = async () => {
    if (step === 'review') return;
    const valid = await form.trigger(BOOKING_STEP_FIELDS[step]);
    if (!valid) return;
    // The location step is already showing why this location can't be booked.
    if ((step === 'pickup' || step === 'dropoff') && locationArea(step).status !== 'supported') return;

    if (step === 'pickup') {
      setStep('dropoff');
    } else if (step === 'dropoff') {
      // Route is calculated once, right after drop-off is confirmed, so the
      // package step can show real prices instead of re-fetching each time.
      if (!(await calculateRoute())) return;
      setStep('package');
    } else if (step === 'package') {
      if (saveDraft()) {
        setSubmitError(null);
        setStep('review');
      }
    }
  };

  const goBack = () => {
    setRouteError(null);
    if (step === 'dropoff') setStep('pickup');
    else if (step === 'package') setStep('dropoff');
  };

  const startNewShipment = () => {
    if (drafts.length >= MAX_SHIPMENTS_PER_BOOKING) return;
    // Most multi-shipment bookings share a pickup, so start from the last one.
    const lastPickup = drafts.at(-1)?.values.pickup;
    form.reset(newShipmentValues(lastPickup));
    setEditingKey(crypto.randomUUID());
    setRoute(null);
    setRouteError(null);
    setStep(lastPickup ? 'dropoff' : 'pickup');
  };

  const editShipment = (key: string) => {
    const draft = drafts.find((d) => d.key === key);
    if (!draft) return;
    form.reset(draft.values);
    setEditingKey(key);
    setRoute(draft.route);
    setRouteError(null);
    setStep('pickup');
  };

  const cancelEditing = () => {
    setRouteError(null);
    setStep('review');
  };

  const removeShipment = (key: string) => {
    const remaining = drafts.filter((d) => d.key !== key);
    setDrafts(remaining);
    if (remaining.length === 0) {
      form.reset(newShipmentValues());
      setEditingKey(crypto.randomUUID());
      setRoute(null);
      setStep('pickup');
    }
  };

  const total = sumPrices(drafts.map((d) => d.price.totalPrice));
  const collectTotal = sumPrices(
    drafts.map((d) => (d.values.recipientPaymentType === 'postpaid' ? (d.values.codAmount ?? 0) : 0)),
  );

  const submit = async () => {
    if (inFlight.current || drafts.length === 0) return;
    const guardError = validateBeforeSubmit?.() ?? null;
    if (guardError) {
      setSubmitError(guardError);
      return;
    }

    inFlight.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    const result = await onSubmit({
      shipments: drafts.map((d) => ({ ...d.values, clientRequestId: d.key })),
      paymentMethod,
      clientRequestId,
    });

    inFlight.current = false;
    setIsSubmitting(false);

    if (!result.success) {
      setSubmitError(result.error);
      return;
    }
    router.push(getSuccessPath(result));
  };

  return {
    form,
    step,
    stepIndex: BOOKING_STEPS.indexOf(step),
    drafts,
    editingKey,
    isEditingExisting,
    lastAddedKey,
    canAddMore: drafts.length < MAX_SHIPMENTS_PER_BOOKING,
    isMerchant,
    route,
    routeError,
    distanceRestriction,
    locationArea,
    serviceAreaBlock,
    tripKey,
    isCalculatingRoute,
    quoteFor,
    goNext,
    goBack,
    startNewShipment,
    editShipment,
    cancelEditing,
    removeShipment,
    paymentMethod,
    setPaymentMethod,
    total,
    collectTotal,
    submit,
    submitError,
    isSubmitting,
  };
};

export type BookingWizardState = ReturnType<typeof useBookingWizard>;
