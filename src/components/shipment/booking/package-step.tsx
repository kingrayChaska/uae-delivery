'use client';

import { useWatch } from 'react-hook-form';
import { Banknote, CalendarClock, CircleCheck, Zap } from 'lucide-react';

import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import Checkbox from '@/components/ui/checkbox';
import FieldError from '@/components/ui/field-error';
import PackageImageUpload from '@/components/shipment/booking/package-image-upload';
import { DELIVERY_TYPE_COPY } from '@/lib/pricing/config';
import { DELIVERY_TYPES, PACKAGE_TYPES } from '@/lib/types';

import type { UseFormReturn } from 'react-hook-form';
import type { BookingShipmentInput } from '@/lib/shipment/schemas';
import type { DeliveryType, PriceBreakdown, PricingRule } from '@/lib/types';

const PACKAGE_TYPE_LABELS: Record<(typeof PACKAGE_TYPES)[number], string> = {
  document: 'Document',
  parcel: 'Parcel',
  fragile: 'Fragile item',
  bulk: 'Bulk / multiple boxes',
};

const DELIVERY_ICONS = { same_day: Zap, next_day: CalendarClock };

// An empty number box means "not provided", not NaN — valueAsNumber would
// turn '' into NaN and block the step.
const optionalNumber = { setValueAs: (value: string) => (value === '' || value == null ? undefined : Number(value)) };

type PackageStepProps = {
  form: UseFormReturn<BookingShipmentInput>;
  uploaderId: string;
  isMerchant: boolean;
  quoteFor: (deliveryType: DeliveryType, values: BookingShipmentInput) => PriceBreakdown | null;
  rules: Record<DeliveryType, PricingRule>;
};

const PackageStep = ({ form, uploaderId, isMerchant, quoteFor, rules }: PackageStepProps) => {
  const { register, setValue, formState, control } = form;
  const { errors } = formState;
  // Watching the whole form re-renders the live prices as fields change.
  const values = useWatch({ control }) as BookingShipmentInput;
  const selectedType = values.deliveryType;
  const postpaid = values.recipientPaymentType === 'postpaid';
  const rule = rules[selectedType] ?? rules.same_day;

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1">
          <span className="block text-lg font-semibold">Delivery service</span>
          <span className="block text-sm text-muted-foreground">
            Prices are for this route{isMerchant ? ' at your merchant rate' : ''}.
          </span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {DELIVERY_TYPES.map((type) => {
            const quote = quoteFor(type, values);
            const Icon = DELIVERY_ICONS[type];
            const blocked = quote?.exceedsDistanceLimit ?? false;
            const selected = selectedType === type;
            return (
              <label
                key={type}
                className={`group relative flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 transition-all duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none ${
                  selected ? 'border-primary bg-secondary/60 shadow-sm' : 'border-input hover:border-primary/40'
                } ${blocked ? 'opacity-60' : ''}`}
              >
                <input type="radio" value={type} className="sr-only" {...register('deliveryType')} />
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <Icon className="size-4 text-primary" aria-hidden />
                    {DELIVERY_TYPE_COPY[type].label}
                  </span>
                  {selected ? <CircleCheck className="size-5 text-primary" aria-hidden /> : null}
                </span>
                <span className="text-sm text-muted-foreground">{DELIVERY_TYPE_COPY[type].description}</span>
                <span className="font-brand-mono text-xl font-semibold">
                  {quote ? `${quote.currency} ${quote.totalPrice.toFixed(2)}` : '—'}
                </span>
                {blocked ? (
                  <span className="text-xs font-medium text-destructive">Not available beyond {quote?.maxDistanceKm} km</span>
                ) : null}
              </label>
            );
          })}
        </div>
        <FieldError message={errors.deliveryType?.message} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Package details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packageType">Shipment type</Label>
            <Select id="packageType" {...register('packageType')}>
              {PACKAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PACKAGE_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packageDescription">What are you sending?</Label>
            <Input
              id="packageDescription"
              placeholder="e.g. 2 pairs of shoes"
              aria-invalid={Boolean(errors.packageDescription) || undefined}
              {...register('packageDescription')}
            />
            <FieldError message={errors.packageDescription?.message} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packageQuantity">Quantity</Label>
            <Input
              id="packageQuantity"
              type="number"
              inputMode="numeric"
              min={1}
              aria-invalid={Boolean(errors.packageQuantity) || undefined}
              {...register('packageQuantity', { valueAsNumber: true })}
            />
            <FieldError message={errors.packageQuantity?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packageWeightKg">
              Total weight (kg){isMerchant ? <span className="text-destructive"> *</span> : ' — optional'}
            </Label>
            <Input
              id="packageWeightKg"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              required={isMerchant}
              aria-required={isMerchant || undefined}
              aria-invalid={Boolean(errors.packageWeightKg) || undefined}
              aria-describedby="weight-hint"
              {...register('packageWeightKg', optionalNumber)}
            />
            <p id="weight-hint" className="text-xs text-muted-foreground">
              Up to {rule.includedWeightKg} kg is included; each extra kg adds {rule.currency}{' '}
              {rule.additionalPricePerKg.toFixed(2)}.
            </p>
            <FieldError message={errors.packageWeightKg?.message} />
          </div>
        </div>

        <details className="group rounded-xl border p-4 [&_summary::-webkit-details-marker]:hidden" open={isMerchant}>
          <summary className="cursor-pointer select-none text-sm font-medium">
            Dimensions (cm) <span className="font-normal text-muted-foreground">— optional, helps us pick the right vehicle</span>
          </summary>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {(
              [
                ['packageLengthCm', 'Length'],
                ['packageWidthCm', 'Width'],
                ['packageHeightCm', 'Height'],
              ] as const
            ).map(([name, label]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <Label htmlFor={name}>{label}</Label>
                <Input id={name} type="number" inputMode="decimal" min={0} step="1" {...register(name, optionalNumber)} />
                <FieldError message={errors[name]?.message} />
              </div>
            ))}
          </div>
        </details>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox className="size-5" {...register('isFragile')} />
          This package is fragile — handle with care
        </label>

        <PackageImageUpload customerId={uploaderId} onChange={(path) => setValue('packageImagePath', path)} />
        {values.packageImagePath ? (
          <p className="text-xs text-muted-foreground">A photo is attached. Upload another to replace it.</p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1">
          <span className="block text-lg font-semibold">Has the recipient paid for this item?</span>
          <span className="block text-sm text-muted-foreground">
            This is about the goods, not the delivery fee.
          </span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['prepaid', 'Prepaid', 'Already paid — nothing to collect.'],
              ['postpaid', 'Postpaid / Cash on Delivery', 'Our driver collects the payment from the recipient.'],
            ] as const
          ).map(([value, label, description]) => {
            const selected = values.recipientPaymentType === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                  selected ? 'border-primary bg-secondary/60' : 'border-input hover:border-primary/40'
                }`}
              >
                <input
                  type="radio"
                  value={value}
                  className="mt-0.5 size-4 accent-primary"
                  {...register('recipientPaymentType', {
                    onChange: () => {
                      if (value === 'prepaid') setValue('codAmount', undefined, { shouldValidate: false });
                    },
                  })}
                />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{description}</span>
                </span>
              </label>
            );
          })}
        </div>

        {postpaid ? (
          <div className="grid gap-4 rounded-xl border border-primary/30 bg-secondary/30 p-4 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="codAmount">
                <Banknote className="size-4 text-primary" aria-hidden />
                Amount to collect from recipient (AED)
              </Label>
              <Input
                id="codAmount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                aria-invalid={Boolean(errors.codAmount) || undefined}
                aria-describedby="cod-hint"
                {...register('codAmount', optionalNumber)}
              />
              <p id="cod-hint" className="text-xs text-muted-foreground">
                The driver collects exactly this for the goods. It isn&apos;t part of your delivery fee.
              </p>
              <FieldError message={errors.codAmount?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="productValue">Product value (AED) — optional</Label>
              <Input id="productValue" type="number" inputMode="decimal" min={0} step="0.01" {...register('productValue', optionalNumber)} />
              <FieldError message={errors.productValue?.message} />
            </div>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
};

export default PackageStep;
