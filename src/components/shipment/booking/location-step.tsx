'use client';

import { useWatch } from 'react-hook-form';

import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import LocationPicker from '@/components/maps/location-picker';
import ServiceAreaNoticeCard from '@/components/shipment/booking/service-area-notice';
import { classifyServiceArea } from '@/lib/service-areas/config';

import type { UseFormReturn } from 'react-hook-form';
import type { BookingShipmentInput } from '@/lib/shipment/schemas';
import type { LocationValue } from '@/lib/maps/location';
import type { Coordinates } from '@/lib/types';
import type { ServiceArea } from '@/lib/service-areas/config';

type LocationStepProps = {
  form: UseFormReturn<BookingShipmentInput>;
  field: 'pickup' | 'dropoff';
  title: string;
  description: string;
  locationLabel: string;
  contactNameLabel: string;
  // Remounts the picker when switching between shipments.
  draftKey: string;
  // The other end of the trip, to bias search results nearby.
  proximity?: Coordinates;
  onPinModeChange?: (active: boolean) => void;
  contactHrefFor: (area: ServiceArea) => string;
};

const LocationStep = ({
  form,
  field,
  title,
  description,
  locationLabel,
  contactNameLabel,
  draftKey,
  proximity,
  onPinModeChange,
  contactHrefFor,
}: LocationStepProps) => {
  const { register, setValue, formState, control } = form;
  const errors = formState.errors[field];
  const location = useWatch({ control, name: field });
  const chosen = typeof location?.lat === 'number' && typeof location?.lng === 'number';
  const value: LocationValue | null =
    chosen && location.place ? { address: location.address, lat: location.lat, lng: location.lng, place: location.place } : null;
  const locationError = errors?.lat?.message ?? errors?.address?.message;
  // Outside Dubai, Sharjah and Ajman (lib/service-areas): say so, and skip
  // the address details — this location can't be booked online.
  const area = value ? classifyServiceArea(value.place) : null;
  const blocked = area !== null && area.status !== 'supported';
  const pinnedWithoutAddress = value?.place.source !== 'search' && !value?.place.street && !value?.place.name;

  return (
    <fieldset className="flex flex-col gap-5">
      <legend className="mb-1">
        <span className="block text-lg font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </legend>

      <LocationPicker
        key={`${draftKey}-${field}`}
        id={field}
        label={locationLabel}
        value={value}
        proximity={proximity}
        error={locationError}
        onPinModeChange={onPinModeChange}
        onChange={(next) => {
          setValue(`${field}.address`, next.address, { shouldValidate: true });
          setValue(`${field}.lat`, next.lat, { shouldValidate: true });
          setValue(`${field}.lng`, next.lng, { shouldValidate: true });
          setValue(`${field}.place`, next.place);
        }}
      />

      {area && blocked ? <ServiceAreaNoticeCard area={area} end={field} contactHref={contactHrefFor(area)} /> : null}

      {value && !blocked ? (
        <div className="flex flex-col gap-4 rounded-xl border border-dashed p-4 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
          <div>
            <p className="text-sm font-medium">Address details <span className="font-normal text-muted-foreground">— optional</span></p>
            <p className="text-sm text-muted-foreground">
              {pinnedWithoutAddress
                ? 'We saved the pin location. Add the building and unit so the driver finds the right door.'
                : 'Help the driver find the exact door.'}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${field}-building`}>Building / Villa / Warehouse</Label>
              <Input id={`${field}-building`} placeholder="e.g. Marina Gate 2" autoComplete="address-line1" {...register(`${field}.building`)} />
              <FieldError message={errors?.building?.message} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${field}-unit`}>Apt / Office / Unit</Label>
                <Input id={`${field}-unit`} placeholder="e.g. 1204" autoComplete="address-line2" {...register(`${field}.unit`)} />
                <FieldError message={errors?.unit?.message} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${field}-floor`}>Floor</Label>
                <Input id={`${field}-floor`} placeholder="e.g. 12" inputMode="text" {...register(`${field}.floor`)} />
                <FieldError message={errors?.floor?.message} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${field}-instructions`}>
              {field === 'pickup' ? 'Pickup instructions' : 'Delivery instructions'}
            </Label>
            <textarea
              id={`${field}-instructions`}
              rows={2}
              placeholder={field === 'pickup' ? 'e.g. Collect from reception' : 'e.g. Call the recipient when you arrive'}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
              {...register(`${field}.instructions`)}
            />
            <FieldError message={errors?.instructions?.message} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${field}-contactName`}>{contactNameLabel}</Label>
          <Input
            id={`${field}-contactName`}
            autoComplete="name"
            aria-invalid={Boolean(errors?.contactName) || undefined}
            aria-describedby={errors?.contactName ? `${field}-contactName-error` : undefined}
            {...register(`${field}.contactName`)}
          />
          <FieldError id={`${field}-contactName-error`} message={errors?.contactName?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${field}-contactPhone`}>Phone number</Label>
          <Input
            id={`${field}-contactPhone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="05X XXX XXXX"
            aria-invalid={Boolean(errors?.contactPhone) || undefined}
            aria-describedby={errors?.contactPhone ? `${field}-contactPhone-error` : undefined}
            {...register(`${field}.contactPhone`)}
          />
          <FieldError id={`${field}-contactPhone-error`} message={errors?.contactPhone?.message} />
        </div>
      </div>
    </fieldset>
  );
};

export default LocationStep;
