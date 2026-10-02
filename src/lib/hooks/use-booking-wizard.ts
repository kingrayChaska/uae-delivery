"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { getRouteAction } from "@/lib/maps/actions";
import {
  checkLocationCoverageAction,
  checkServiceAreasAction,
} from "@/lib/service-areas/actions";
import {
  UNVERIFIED_SERVICE_AREA,
  classifyServiceArea,
  isBookable,
} from "@/lib/service-areas/config";
import {
  BOOKING_STEP_FIELDS,
  MAX_SHIPMENTS_PER_BOOKING,
  bookingShipmentSchema,
} from "@/lib/shipment/schemas";
import { calculateShipmentPrice, sumPrices } from "@/lib/pricing/calculate";
import {
  BOOKING_ERRORS,
  distanceLimitMessage,
  validateBookingLocations,
} from "@/lib/shipment/booking-guards";
import { DELIVERY_TYPES } from "@/lib/types";

import type {
  BookingShipmentInput,
  MultiBookingInput,
} from "@/lib/shipment/schemas";
import type { CreateBookingResult } from "@/lib/shipment/actions";
import type {
  AccountType,
  DeliveryType,
  PaymentMethod,
  PriceBreakdown,
  PricingRule,
} from "@/lib/types";
import type { RouteResult } from "@/lib/maps/types";
import type { LocationEnd, ServiceArea } from "@/lib/service-areas/config";

// A location the server found outside the normal service area, for the trip
// it was checked for (so it stops showing once either end changes).
export type ServiceAreaBlock = {
  end: LocationEnd;
  area: ServiceArea;
  trip: string;
};

// What the wizard knows about one location's coverage: the verdict, or
// "checking" while the server confirms a location the browser couldn't.
export type LocationCoverage =
  | ServiceArea
  | { status: "checking"; emirate: null };

type WizardLocation = {
  lat?: number;
  lng?: number;
  place?: { placeId?: string | null } | null;
};

const pointKey = (location: WizardLocation) =>
  `${location.lat},${location.lng}|${location.place?.placeId ?? ""}`;

const tripKey = (
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
) => `${pickup.lat},${pickup.lng}|${dropoff.lat},${dropoff.lng}`;

// Steps for the shipment being edited; 'review' is the booking basket.
export const BOOKING_STEPS = [
  "pickup",
  "dropoff",
  "package",
  "review",
] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export type ShipmentDraft = {
  // Doubles as the shipment's clientRequestId (duplicate-submit protection).
  key: string;
  values: BookingShipmentInput;
  route: RouteResult;
  price: PriceBreakdown;
};

const emptyLocation = {
  address: "",
  lat: undefined,
  lng: undefined,
  contactName: "",
  contactPhone: "",
};

const newShipmentValues = (pickup?: BookingShipmentInput["pickup"]) =>
  ({
    pickup: pickup ?? emptyLocation,
    dropoff: emptyLocation,
    deliveryType: "same_day",
    packageType: "parcel",
    packageDescription: "",
    packageQuantity: 1,
    packageWeightKg: undefined,
    packageLengthCm: undefined,
    packageWidthCm: undefined,
    packageHeightCm: undefined,
    isFragile: false,
    packageImagePath: null,
    recipientPaymentType: "prepaid",
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
  getSuccessPath: (
    result: Extract<CreateBookingResult, { success: true }>,
  ) => string;
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
  const [step, setStep] = useState<BookingStep>("pickup");
  const [drafts, setDrafts] = useState<ShipmentDraft[]>([]);
  // The draft being edited, or a fresh key for a new shipment.
  const [editingKey, setEditingKey] = useState(() => crypto.randomUUID());
  // The route and the exact trip (both ends' coordinates) it was calculated
  // for — so a route, distance or price is never shown for a trip whose
  // pickup or delivery has since moved.
  const [routed, setRouted] = useState<{
    trip: string;
    route: RouteResult;
  } | null>(null);
  const route = routed?.route ?? null;
  const routeRequest = useRef<{
    trip: string;
    promise: Promise<boolean>;
  } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [serviceAreaBlock, setServiceAreaBlock] =
    useState<ServiceAreaBlock | null>(null);
  // The server's verdict for locations the browser couldn't place in an
  // emirate, by point (and selected place).
  const [serverCoverage, setServerCoverage] = useState<
    Record<string, ServiceArea>
  >({});
  const coverageRequested = useRef(new Set<string>());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
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
    mode: "onTouched",
  });

  const isMerchant = accountType === "merchant";
  const isEditingExisting = drafts.some((draft) => draft.key === editingKey);

  // Live quote for every delivery type, so the package step can show both
  // prices side by side. Same engine the server uses.
  const quoteFor = (
    deliveryType: DeliveryType,
    values = form.getValues(),
  ): PriceBreakdown | null =>
    route
      ? calculateShipmentPrice({
          rule: rules[deliveryType],
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          weightKg: Number.isFinite(values.packageWeightKg)
            ? values.packageWeightKg
            : null,
          recipientPaymentType: values.recipientPaymentType,
          shipmentQuantity: values.packageQuantity,
          codAmount: values.codAmount,
        })
      : null;

  // Blocked for every service = the trip itself is too long.
  const distanceRestriction = (() => {
    if (!route) return null;
    const quotes = DELIVERY_TYPES.map((type) => quoteFor(type)).filter(
      (q): q is PriceBreakdown => q !== null,
    );
    if (quotes.length === 0 || !quotes.every((q) => q.exceedsDistanceLimit))
      return null;
    const limit = Math.max(...quotes.map((q) => q.maxDistanceKm));
    return distanceLimitMessage(quotes[0].distanceKm, limit);
  })();

  // One coverage verdict per location, from the same rules everywhere
  // (lib/service-areas). Instant when the selected Google place names its
  // emirate; otherwise the server decides (verifyLocationCoverage) — a
  // location is never turned away just because the browser lacked the
  // detail. The server re-checks both ends again before pricing and booking.
  const locationArea = (
    end: LocationEnd,
    values = form.getValues(),
  ): LocationCoverage => {
    const location = values[end];
    const local = classifyServiceArea(location?.place);
    if (local.status !== "unverified" || typeof location?.lat !== "number")
      return local;
    return (
      serverCoverage[pointKey(location)] ?? {
        status: "checking",
        emirate: null,
      }
    );
  };

  // Asks the server about a chosen location the browser couldn't place.
  // Once per location; a failed request counts as unverified.
  const verifyLocationCoverage = (end: LocationEnd) => {
    const location = form.getValues()[end];
    if (typeof location?.lat !== "number" || typeof location?.lng !== "number")
      return;
    if (classifyServiceArea(location.place).status !== "unverified") return;
    const key = pointKey(location);
    if (coverageRequested.current.has(key)) return;
    coverageRequested.current.add(key);
    void checkLocationCoverageAction({
      lat: location.lat,
      lng: location.lng,
      placeId: location.place?.placeId ?? null,
    })
      .catch(() => null)
      .then((result) => {
        if (!result?.success) coverageRequested.current.delete(key);
        setServerCoverage((current) => ({
          ...current,
          [key]: result?.success ? result.area : UNVERIFIED_SERVICE_AREA,
        }));
      });
  };

  // Route, distance and duration from Google (via the server), plus the
  // server's own emirate check. Runs automatically once both ends are set
  // (the preview on the delivery step) and again on Continue, which reuses
  // the answer when neither end has moved. Answers for a trip that has
  // since changed are dropped.
  const calculateRoute = (): Promise<boolean> => {
    const { pickup, dropoff } = form.getValues();
    setRouteError(null);

    const locationError = validateBookingLocations(pickup, dropoff);
    if (locationError) {
      routeRequest.current = null;
      setIsCalculatingRoute(false);
      setRouteError(locationError);
      setRouted(null);
      return Promise.resolve(false);
    }

    const trip = tripKey(pickup, dropoff);
    if (routed?.trip === trip) return Promise.resolve(true);
    if (routeRequest.current?.trip === trip)
      return routeRequest.current.promise;

    setIsCalculatingRoute(true);
    // Each end is checked on its own, from its selected Google place.
    const coverageRequest = {
      pickup: {
        lat: pickup.lat,
        lng: pickup.lng,
        placeId: pickup.place?.placeId ?? null,
      },
      dropoff: {
        lat: dropoff.lat,
        lng: dropoff.lng,
        placeId: dropoff.place?.placeId ?? null,
      },
    };
    // The selected places go with the route request so the quote is routed
    // exactly as the booking will be (lib/maps/delivery-route.ts).
    const routeInput = {
      origin: { ...coverageRequest.pickup, source: pickup.place?.source },
      destination: { ...coverageRequest.dropoff, source: dropoff.place?.source },
    };
    const promise = (async () => {
      // The server's own emirate check — the one the booking will get — runs
      // alongside the route, so prices only appear for bookable trips.
      const failed = {
        success: false as const,
        error: BOOKING_ERRORS.routeFailed,
      };
      const [result, areas] = await Promise.all([
        getRouteAction(routeInput).catch(() => failed),
        checkServiceAreasAction(coverageRequest).catch(() => failed),
      ]);
      if (routeRequest.current?.trip !== trip) return false; // a newer trip won
      routeRequest.current = null;
      setIsCalculatingRoute(false);

      if (!areas.success) {
        setRouteError(areas.error);
        setRouted(null);
        return false;
      }
      const blockedEnd = (["pickup", "dropoff"] as const).find(
        (end) => !isBookable(areas.areas[end]),
      );
      if (blockedEnd) {
        setServiceAreaBlock({
          end: blockedEnd,
          area: areas.areas[blockedEnd],
          trip,
        });
        setRouted(null);
        return false;
      }
      setServiceAreaBlock(null);

      if (!result.success) {
        setRouteError(result.error);
        setRouted(null);
        return false;
      }

      setRouted({ trip, route: result.route });
      return true;
    })();
    routeRequest.current = { trip, promise };
    return promise;
  };

  const saveDraft = () => {
    if (!route) return false;
    const values = form.getValues();

    if (!(Number(values.packageWeightKg) > 0)) {
      form.setError("packageWeightKg", {
        message: BOOKING_ERRORS.weightRequired,
      });
      return false;
    }

    const price = quoteFor(values.deliveryType, values);
    if (!price) return false;
    if (price.exceedsDistanceLimit) {
      setRouteError(
        distanceLimitMessage(price.distanceKm, price.maxDistanceKm),
      );
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
    if (step === "review") return;
    const valid = await form.trigger(BOOKING_STEP_FIELDS[step]);
    if (!valid) return;
    // Only an active emirate continues; the location step is already
    // showing why (or that it's still checking).
    if (
      (step === "pickup" || step === "dropoff") &&
      locationArea(step).status !== "active"
    )
      return;

    if (step === "pickup") {
      setStep("dropoff");
    } else if (step === "dropoff") {
      // Usually already calculated by the preview; the package step then
      // shows real prices instead of re-fetching each time.
      if (!(await calculateRoute())) return;
      setStep("package");
    } else if (step === "package") {
      if (saveDraft()) {
        setSubmitError(null);
        setStep("review");
      }
    }
  };

  const goBack = () => {
    setRouteError(null);
    if (step === "dropoff") setStep("pickup");
    else if (step === "package") setStep("dropoff");
  };

  const startNewShipment = () => {
    if (drafts.length >= MAX_SHIPMENTS_PER_BOOKING) return;
    // Most multi-shipment bookings share a pickup, so start from the last one.
    const lastPickup = drafts.at(-1)?.values.pickup;
    form.reset(newShipmentValues(lastPickup));
    setEditingKey(crypto.randomUUID());
    setRouted(null);
    setRouteError(null);
    setStep(lastPickup ? "dropoff" : "pickup");
  };

  const editShipment = (key: string) => {
    const draft = drafts.find((d) => d.key === key);
    if (!draft) return;
    form.reset(draft.values);
    setEditingKey(key);
    setRouted({
      trip: tripKey(draft.values.pickup, draft.values.dropoff),
      route: draft.route,
    });
    setRouteError(null);
    setStep("pickup");
  };

  const cancelEditing = () => {
    setRouteError(null);
    setStep("review");
  };

  const removeShipment = (key: string) => {
    const remaining = drafts.filter((d) => d.key !== key);
    setDrafts(remaining);
    if (remaining.length === 0) {
      form.reset(newShipmentValues());
      setEditingKey(crypto.randomUUID());
      setRouted(null);
      setStep("pickup");
    }
  };

  const total = sumPrices(drafts.map((d) => d.price.totalPrice));
  const collectTotal = sumPrices(
    drafts.map((d) =>
      d.values.recipientPaymentType === "postpaid"
        ? (d.values.codAmount ?? 0)
        : 0,
    ),
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

    let result: CreateBookingResult;
    try {
      result = await onSubmit({
        shipments: drafts.map((d) => ({ ...d.values, clientRequestId: d.key })),
        paymentMethod,
        clientRequestId,
      });
    } catch {
      result = { success: false, error: "booking.errors.bookingFailed" };
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }

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
    // The trip the route belongs to (compare with tripKey of the form's ends).
    routeTrip: routed?.trip ?? null,
    calculateRoute,
    routeError,
    distanceRestriction,
    locationArea,
    verifyLocationCoverage,
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
