'use client';

import { useWatch } from 'react-hook-form';
import { Banknote, CalendarClock, CircleCheck, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import Checkbox from '@/components/ui/checkbox';
import FieldError from '@/components/ui/field-error';
import PackageImageUpload from '@/components/shipment/booking/package-image-upload';
import { DELIVERY_TYPES, PACKAGE_TYPES } from '@/lib/types';
import { useFormat } from '@/i18n/hooks';

import type { UseFormReturn } from 'react-hook-form';
import type { BookingShipmentInput } from '@/lib/shipment/schemas';
import type { DeliveryType, PriceBreakdown, PricingRule } from '@/lib/types';

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
  const t = useTranslations('booking.package');
  const tShipments = useTranslations('shipments');
  const format = useFormat();
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
          <span className="block text-lg font-semibold">{t('serviceTitle')}</span>
          <span className="block text-sm text-muted-foreground">
            {isMerchant ? t('servicePricesMerchant') : t('servicePrices')}
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
                    {tShipments(`deliveryType.${type}.label`)}
                  </span>
                  {selected ? <CircleCheck className="size-5 text-primary" aria-hidden /> : null}
                </span>
                <span className="text-sm text-muted-foreground">{tShipments(`deliveryType.${type}.description`)}</span>
                <span className="font-brand-mono text-xl font-semibold">
                  {quote ? format.money(quote.totalPrice, quote.currency) : '—'}
                </span>
                {blocked && quote ? (
                  <span className="text-xs font-medium text-destructive">
                    {t('notAvailableBeyond', { distance: format.km(quote.maxDistanceKm, 0) })}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
        <FieldError message={errors.deliveryType?.message} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">{t('detailsTitle')}</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packageType">{t('type')}</Label>
            <Select id="packageType" {...register('packageType')}>
              {PACKAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packageDescription">{t('description')}</Label>
            <Input
              id="packageDescription"
              placeholder={t('descriptionPlaceholder')}
              aria-invalid={Boolean(errors.packageDescription) || undefined}
              {...register('packageDescription')}
            />
            <FieldError message={errors.packageDescription?.message} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packageQuantity">{t('quantity')}</Label>
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
              {isMerchant ? (
                <>
                  {t('weight')}
                  <span className="text-destructive"> *</span>
                </>
              ) : (
                t('weightOptional')
              )}
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
              {t('weightHint', { weight: format.kg(rule.includedWeightKg), price: format.money(rule.additionalPricePerKg, rule.currency) })}
            </p>
            <FieldError message={errors.packageWeightKg?.message} />
          </div>
        </div>

        <details className="group rounded-xl border p-4 [&_summary::-webkit-details-marker]:hidden" open={isMerchant}>
          <summary className="cursor-pointer select-none text-sm font-medium">
            {t('dimensions')} <span className="font-normal text-muted-foreground">{t('dimensionsHint')}</span>
          </summary>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {(
              [
                ['packageLengthCm', 'length'],
                ['packageWidthCm', 'width'],
                ['packageHeightCm', 'height'],
              ] as const
            ).map(([name, label]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <Label htmlFor={name}>{t(label)}</Label>
                <Input id={name} type="number" inputMode="decimal" min={0} step="1" {...register(name, optionalNumber)} />
                <FieldError message={errors[name]?.message} />
              </div>
            ))}
          </div>
        </details>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox className="size-5" {...register('isFragile')} />
          {t('fragile')}
        </label>

        <PackageImageUpload customerId={uploaderId} onChange={(path) => setValue('packageImagePath', path)} />
        {values.packageImagePath ? (
          <p className="text-xs text-muted-foreground">{t('photoAttached')}</p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1">
          <span className="block text-lg font-semibold">{t('recipientPaidTitle')}</span>
          <span className="block text-sm text-muted-foreground">{t('recipientPaidHint')}</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['prepaid', t('prepaid'), t('prepaidHint')],
              ['postpaid', t('postpaid'), t('postpaidHint')],
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
                {t('codAmount')}
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
                {t('codHint')}
              </p>
              <FieldError message={errors.codAmount?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="productValue">{t('productValue')}</Label>
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
