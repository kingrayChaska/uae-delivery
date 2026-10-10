"use client";

import { useEffect, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Headset,
  LoaderCircle,
  PackageCheck,
  Route,
  X,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/button";
import FieldError from "@/components/ui/field-error";
import RouteMap from "@/components/maps/lazy-route-map";
import BookingProgress from "@/components/shipment/booking/booking-progress";
import LocationStep from "@/components/shipment/booking/location-step";
import PackageStep from "@/components/shipment/booking/package-step";
import ReviewStep from "@/components/shipment/booking/review-step";
import RouteSummary from "@/components/shipment/booking/route-summary";
import ServiceAreaNoticeCard from "@/components/shipment/booking/service-area-notice";
import { useBookingWizard } from "@/lib/hooks/use-booking-wizard";
import { useAddressParts } from "@/lib/maps/use-address-parts";
import { reverseGeocodeAction } from "@/lib/maps/actions";
import { isInsideUae, toLocationValue } from "@/lib/maps/location";
import { widestDistanceLimit } from "@/lib/pricing/config";
import { DELIVERY_TYPES } from "@/lib/types";
import {
  SUPPORTED_EMIRATES,
  serviceAreaRequest,
} from "@/lib/service-areas/config";
import { msg } from "@/i18n/message";
import { useAppLocale, useFormat, useMessage } from "@/i18n/hooks";

import type { ReactNode } from "react";
import type { MultiBookingInput } from "@/lib/shipment/schemas";
import type { CreateBookingResult } from "@/lib/shipment/actions";
import type { AccountType, DeliveryType, PaymentMethod, PricingRule } from "@/lib/types";
import type { ServiceArea } from "@/lib/service-areas/config";
import type { RouteEnd } from "@/components/maps/route-map";
import type { Coordinates } from "@/lib/types";

type BookingWizardProps = {
  // Folder owner for package-photo uploads — must equal the signed-in
  // user's id to satisfy the package-images RLS insert policy (migration 0012).
  uploaderId: string;
  rules: Record<DeliveryType, PricingRule>;
  accountType: AccountType;
  onSubmit: (input: MultiBookingInput) => Promise<CreateBookingResult>;
  getSuccessPath: (
    result: Extract<CreateBookingResult, { success: true }>,
  ) => string;
  validateBeforeSubmit?: () => string | null;
  supportHref?: string;
  header?: ReactNode;
  // Show delivery prices before a delivery type is chosen (the route
  // summary's "from" price and a price on each Same Day / Next Day card).
  // Staff quoting on a customer's behalf only: customers see their fee on
  // the review step, once they've chosen. The quote itself is always
  // computed — it drives the distance-limit checks and the review step.
  showPrices?: boolean;
  // How the delivery fee may be paid (default: every method).
  paymentMethods?: readonly PaymentMethod[];
};

const sr = (chunks: ReactNode) => <span className="sr-only">{chunks}</span>;

const BookingWizard = ({
  uploaderId,
  rules,
  accountType,
  onSubmit,
  getSuccessPath,
  validateBeforeSubmit,
  supportHref,
  header = null,
  showPrices = false,
  paymentMethods,
}: BookingWizardProps) => {
  const t = useTranslations("booking.wizard");
  const translate = useMessage();
  const format = useFormat();
  const locale = useAppLocale();
  const splitAddress = useAddressParts();
  const wizard = useBookingWizard({
    rules,
    accountType,
    onSubmit,
    getSuccessPath,
    validateBeforeSubmit,
    paymentMethods,
  });
  const { form, step, drafts } = wizard;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const pickup = useWatch({ control: form.control, name: "pickup" });
  const dropoff = useWatch({ control: form.control, name: "dropoff" });
  const hasPickup =
    typeof pickup?.lat === "number" && typeof pickup?.lng === "number";
  const hasDropoff =
    typeof dropoff?.lat === "number" && typeof dropoff?.lng === "number";
  const pickupPoint = hasPickup
    ? { lat: pickup.lat, lng: pickup.lng }
    : undefined;
  const dropoffPoint = hasDropoff
    ? { lat: dropoff.lat, lng: dropoff.lng }
    : undefined;
  // The trip's ends as routed: the point plus the selected place.
  const pickupEnd = pickupPoint
    ? { ...pickupPoint, place: pickup.place }
    : undefined;
  const dropoffEnd = dropoffPoint
    ? { ...dropoffPoint, place: dropoff.place }
    : undefined;
  // Only one map at a time: the route preview hides while a pin is being dropped.
  const [pinning, setPinning] = useState(false);
  const shipmentNumber = wizard.isEditingExisting
    ? drafts.findIndex((d) => d.key === wizard.editingKey) + 1
    : drafts.length + 1;
  const blockedByDistance =
    step === "package" && wizard.distanceRestriction !== null;
  const maxDistanceKm = widestDistanceLimit(rules.same_day, rules.next_day);
  const currency = rules.same_day.currency;

  // Where "Contact Support" goes: a support request already describing
  // the delivery, in the customer's language, when the page has one
  // (customers), else the public contact section.
  const contactHrefFor = (area: ServiceArea) => {
    if (!supportHref) return "/#contact";
    const request = serviceAreaRequest(area, {
      pickup: hasPickup ? pickup.address : undefined,
      dropoff: hasDropoff ? dropoff.address : undefined,
    });
    const [first, ...route] = request.lines.map(translate);
    const message = [first, "", ...route].join("\n");
    return `${supportHref}?${new URLSearchParams({ subject: translate(request.subject), message })}`;
  };
  // One coverage verdict per end, from lib/service-areas (the same rules
  // the server applies to the booking).
  const pickupArea = hasPickup ? wizard.locationArea("pickup") : null;
  const dropoffArea = hasDropoff ? wizard.locationArea("dropoff") : null;
  const stepArea =
    step === "pickup" ? pickupArea : step === "dropoff" ? dropoffArea : null;
  // Can't continue: outside active coverage, or still being confirmed.
  const locationChecking = stepArea?.status === "checking";
  const locationBlocked =
    stepArea !== null && stepArea.status !== "active" && !locationChecking;

  // A location the browser couldn't place in an emirate is confirmed by the
  // server as soon as it's chosen, instead of being turned away.
  const pickupKey = hasPickup
    ? `${pickup.lat},${pickup.lng},${pickup.place?.placeId ?? ""}`
    : null;
  const dropoffKey = hasDropoff
    ? `${dropoff.lat},${dropoff.lng},${dropoff.place?.placeId ?? ""}`
    : null;
  useEffect(() => {
    if (pickupKey) wizard.verifyLocationCoverage("pickup");
    if (dropoffKey) wizard.verifyLocationCoverage("dropoff");
    // Keyed on the two locations; the hook reads the current form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupKey, dropoffKey]);
  // The server's verdict for the trip on screen (it can differ from the
  // instant one right on an emirate border).
  const serverBlock =
    wizard.serviceAreaBlock &&
    pickupEnd &&
    dropoffEnd &&
    wizard.serviceAreaBlock.trip === wizard.tripKey(pickupEnd, dropoffEnd)
      ? wizard.serviceAreaBlock
      : null;
  const total = format.money(wizard.total, currency);

  // The route on screen belongs to exactly these two points, or isn't shown.
  const trip =
    pickupEnd && dropoffEnd
      ? wizard.tripKey(pickupEnd, dropoffEnd)
      : null;
  const currentRoute =
    trip !== null && wizard.routeTrip === trip ? wizard.route : null;
  const fromPrice = currentRoute && showPrices
    ? (() => {
        const prices = DELIVERY_TYPES.map((type) => wizard.quoteFor(type))
          .filter((quote) => quote !== null && !quote.exceedsDistanceLimit)
          .map((quote) => quote!.totalPrice);
        return prices.length ? Math.min(...prices) : null;
      })()
    : null;

  // Route, distance, drive time and price are worked out as soon as both
  // ends are chosen (and again whenever either moves) — once per trip.
  const bothBookable =
    pickupArea?.status === "active" && dropoffArea?.status === "active";
  const canPreviewRoute =
    step === "dropoff" && trip !== null && bothBookable && !pinning;
  useEffect(() => {
    if (canPreviewRoute) void wizard.calculateRoute();
    // Keyed on the trip itself; calculateRoute reads the current form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPreviewRoute, trip]);

  // Dragging a pin on the route map moves that end of the trip: the new
  // point is described by Google, and the route and price follow.
  const [moveStatus, setMoveStatus] = useState<"idle" | "updating" | "updated">(
    "idle",
  );
  const moveId = useRef(0);
  const moveEnd = async (end: RouteEnd, coordinates: Coordinates) => {
    const id = ++moveId.current;
    setMoveStatus("updating");
    const result = isInsideUae(coordinates)
      ? await reverseGeocodeAction({ ...coordinates, language: locale }).catch(
          () => null,
        )
      : null;
    if (id !== moveId.current) return; // moved again since
    // A failed lookup still keeps the exact point (as a pinned location).
    const next = toLocationValue(
      coordinates,
      "pin",
      result?.success ? result.location : null,
    );
    form.setValue(`${end}.address`, next.address, { shouldValidate: true });
    form.setValue(`${end}.lat`, next.lat, { shouldValidate: true });
    form.setValue(`${end}.lng`, next.lng, { shouldValidate: true });
    form.setValue(`${end}.place`, next.place);
    setMoveStatus("updated");
    setTimeout(() => {
      if (id === moveId.current) setMoveStatus("idle");
    }, 2500);
  };

  const showMap =
    !pinning &&
    ((step === "pickup" && hasPickup && !locationBlocked) ||
      (step === "dropoff" && hasPickup && !locationBlocked && !serverBlock));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">
          {accountType === "merchant" ? t("subtitleMerchant") : t("subtitle")}
        </p>
      </div>

      {header}
      <BookingProgress stepIndex={wizard.stepIndex} />

      <section
        aria-labelledby="wizard-heading"
        className="flex flex-col gap-6 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      >
        <h2 id="wizard-heading" className="sr-only">
          {step === "review"
            ? t("reviewHeading")
            : t("shipmentHeading", { number: shipmentNumber })}
        </h2>
        {step !== "review" && drafts.length > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <PackageCheck className="size-4 text-primary" aria-hidden />
              {wizard.isEditingExisting
                ? t("editingShipment", { number: shipmentNumber })
                : t("addingShipment", { number: shipmentNumber })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={wizard.cancelEditing}
            >
              <X aria-hidden />
              {translate("common.actions.cancel")}
            </Button>
          </div>
        ) : null}

        {/* key: re-mount the step (and its entrance animation) on change.
            Steps slide in from the reading direction's far side. */}
        <div
          key={`${step}-${wizard.editingKey}`}
          className="animate-in fade-in-0 slide-in-from-right-2 duration-300 rtl:slide-in-from-left-2 motion-reduce:animate-none"
        >
          {step === "pickup" ? (
            <LocationStep
              form={form}
              field="pickup"
              draftKey={wizard.editingKey}
              title={t("pickupTitle")}
              description={t("pickupDescription")}
              locationLabel={t("pickupLabel")}
              contactNameLabel={t("contactName")}
              proximity={dropoffPoint}
              onPinModeChange={setPinning}
              area={pickupArea}
              contactHrefFor={contactHrefFor}
            />
          ) : null}

          {step === "dropoff" && hasPickup ? (
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-muted/60 p-3 text-sm">
              <CircleCheck
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("pickupRecap")}
                </p>
                <p className="wrap-break-word font-medium">
                  {splitAddress(pickup.address).title}
                </p>
                {pickup.building || pickup.unit ? (
                  <p className="text-muted-foreground">
                    {[
                      pickup.building,
                      pickup.unit && t("unit", { unit: pickup.unit }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={wizard.goBack}
              >
                {t.rich("changePickup", { sr })}
              </Button>
            </div>
          ) : null}

          {step === "dropoff" ? (
            <LocationStep
              form={form}
              field="dropoff"
              draftKey={wizard.editingKey}
              title={t("dropoffTitle")}
              description={translate(
                maxDistanceKm === null
                  ? msg("booking.wizard.dropoffDescriptionAnyDistance", {
                      supported: SUPPORTED_EMIRATES,
                    })
                  : msg("booking.wizard.dropoffDescription", {
                      supported: SUPPORTED_EMIRATES,
                      distance: format.km(maxDistanceKm, 0),
                    }),
              )}
              locationLabel={t("dropoffLabel")}
              contactNameLabel={t("recipientName")}
              proximity={pickupPoint}
              onPinModeChange={setPinning}
              area={dropoffArea}
              contactHrefFor={contactHrefFor}
            />
          ) : null}

          {step === "package" ? (
            <PackageStep
              form={form}
              uploaderId={uploaderId}
              isMerchant={wizard.isMerchant}
              quoteFor={wizard.quoteFor}
              rules={rules}
              showPrices={showPrices}
            />
          ) : null}

          {step === "review" ? (
            <ReviewStep
              drafts={drafts}
              lastAddedKey={wizard.lastAddedKey}
              canAddMore={wizard.canAddMore}
              total={wizard.total}
              collectTotal={wizard.collectTotal}
              paymentMethod={wizard.paymentMethod}
              paymentMethods={paymentMethods}
              onPaymentMethodChange={wizard.setPaymentMethod}
              onEdit={wizard.editShipment}
              onRemove={wizard.removeShipment}
              onAddAnother={wizard.startNewShipment}
            />
          ) : null}
        </div>

        {step === "dropoff" && serverBlock && !locationBlocked ? (
          <ServiceAreaNoticeCard
            area={serverBlock.area}
            end={serverBlock.end}
            contactHref={contactHrefFor(serverBlock.area)}
          />
        ) : null}

        {showMap ? (
          <div className="flex flex-col gap-2">
            <RouteMap
              pickup={pickupPoint}
              dropoff={step === "dropoff" ? dropoffPoint : undefined}
              route={
                step === "dropoff" ? (currentRoute ?? undefined) : undefined
              }
              onMove={moveEnd}
              className="h-56 w-full rounded-xl border sm:h-72"
            />
            <p
              aria-live="polite"
              className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground"
            >
              {moveStatus === "updating" ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  {t("mapUpdating")}
                </>
              ) : moveStatus === "updated" ? (
                <>
                  <CircleCheck className="size-3.5 text-primary" aria-hidden />
                  <span className="font-medium text-primary">
                    {t("mapUpdated")}
                  </span>
                </>
              ) : (
                t("mapHint")
              )}
            </p>
          </div>
        ) : null}

        {step === "dropoff" &&
        trip !== null &&
        bothBookable &&
        !pinning &&
        !serverBlock ? (
          <RouteSummary
            route={currentRoute}
            calculating={wizard.isCalculatingRoute}
            fromPrice={fromPrice}
            currency={currency}
            showPrice={showPrices}
          />
        ) : null}

        {step === "package" && wizard.route ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Route className="size-4 text-primary" aria-hidden />
            {t("byRoad", {
              distance: format.km(wizard.route.distanceKm),
              duration: format.duration(wizard.route.durationMinutes),
            })}
          </p>
        ) : null}

        {blockedByDistance ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
          >
            <p className="flex items-start gap-2 text-sm font-medium text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("longDistanceTitle")}
            </p>
            <p className="text-sm">{translate(wizard.distanceRestriction)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={wizard.goBack}
              >
                <ArrowLeft className="rtl:rotate-180" aria-hidden />
                {t("changeDelivery")}
              </Button>
              {supportHref ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={supportHref}>
                    <Headset aria-hidden />
                    {t("contactSupport")}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {wizard.routeError && !blockedByDistance ? (
          <FieldError message={wizard.routeError} />
        ) : null}
        {wizard.submitError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 p-4"
          >
            <FieldError message={wizard.submitError} />
          </div>
        ) : null}

        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur sm:static sm:m-0 sm:flex-row sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          {step === "review" ? (
            <span />
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={wizard.goBack}
              disabled={step === "pickup"}
            >
              <ArrowLeft className="rtl:rotate-180" aria-hidden />
              {translate("common.actions.back")}
            </Button>
          )}

          {step === "review" ? (
            <Button
              type="button"
              size="lg"
              onClick={wizard.submit}
              loading={wizard.isSubmitting}
              loadingText={t("booking")}
              disabled={drafts.length === 0}
            >
              {drafts.length > 1
                ? t("confirmMany", { count: drafts.length, total })
                : t("confirm", { total })}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={wizard.goNext}
              loading={wizard.isCalculatingRoute}
              loadingText={t("calculatingRoute")}
              disabled={
                blockedByDistance ||
                locationBlocked ||
                locationChecking ||
                (step === "dropoff" && serverBlock !== null)
              }
            >
              {step === "package"
                ? wizard.isEditingExisting
                  ? t("saveShipment")
                  : t("addToBooking")
                : translate("common.actions.continue")}
              <ArrowRight className="rtl:rotate-180" aria-hidden />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
};

export default BookingWizard;
