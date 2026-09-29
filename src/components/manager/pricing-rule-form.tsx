'use client';

import { CircleCheck } from 'lucide-react';

import Button from '@/components/ui/button';
import Checkbox from '@/components/ui/checkbox';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import FieldError from '@/components/ui/field-error';
import Field from '@/components/manager/field';
import FareCalculator from '@/components/pricing/fare-calculator';
import { usePricingRuleForm } from '@/lib/hooks/use-pricing-rule-form';
import { ACCOUNT_TYPES, DELIVERY_TYPES } from '@/lib/types';
import { DELIVERY_TYPE_COPY } from '@/lib/pricing/config';

import type { AccountType, DeliveryType, PricingRuleSet } from '@/lib/types';

const ACCOUNT_LABELS: Record<AccountType, string> = { individual: 'Individual customers', merchant: 'Merchants' };

const PricingRuleForm = ({ current }: { current: PricingRuleSet }) => {
  const {
    register,
    errors,
    isSubmitting,
    serverError,
    savedMessage,
    previewRule,
    deliveryType,
    accountType,
    selectTarget,
    onSubmit,
  } = usePricingRuleForm(current);

  const number = { valueAsNumber: true } as const;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountType">Applies to</Label>
            <Select
              id="accountType"
              value={accountType}
              onChange={(event) => selectTarget(event.target.value as AccountType, deliveryType)}
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deliveryType">Service</Label>
            <Select
              id="deliveryType"
              value={deliveryType}
              onChange={(event) => selectTarget(accountType, event.target.value as DeliveryType)}
            >
              {DELIVERY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DELIVERY_TYPE_COPY[type].label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Field id="name" label="Rule name" placeholder="e.g. Next-Day 2027" error={errors.name?.message} {...register('name')} />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">Distance</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="baseDistanceKm" type="number" step="0.1" min={0} label="Included km" error={errors.baseDistanceKm?.message} {...register('baseDistanceKm', number)} />
            <Field id="basePrice" type="number" step="0.01" min={0} label="Base price (AED)" error={errors.basePrice?.message} {...register('basePrice', number)} />
            <Field id="additionalPricePerKm" type="number" step="0.01" min={0} label="Per extra km" error={errors.additionalPricePerKm?.message} {...register('additionalPricePerKm', number)} />
          </div>
          <p className="text-xs text-muted-foreground">Set “Per extra km” to 0 for a flat rate up to the maximum distance.</p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">Weight, COD and limits</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="includedWeightKg" type="number" step="0.5" min={0} label="Included weight (kg)" error={errors.includedWeightKg?.message} {...register('includedWeightKg', number)} />
            <Field id="additionalPricePerKg" type="number" step="0.01" min={0} label="Per extra kg (AED)" error={errors.additionalPricePerKg?.message} {...register('additionalPricePerKg', number)} />
            <Field id="codFee" type="number" step="0.01" min={0} label="COD handling fee (AED)" error={errors.codFee?.message} {...register('codFee', number)} />
            <Field id="maxDistanceKm" type="number" step="1" min={1} label="Maximum distance (km)" error={errors.maxDistanceKm?.message} {...register('maxDistanceKm', number)} />
          </div>
        </fieldset>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox className="size-5" {...register('activate')} />
          Make this the active rule for {ACCOUNT_LABELS[accountType].toLowerCase()} · {DELIVERY_TYPE_COPY[deliveryType].label.toLowerCase()}
        </label>
        <p className="text-xs text-muted-foreground">
          Rules are never edited in place — existing shipments keep the rule they were priced under.
        </p>
        <FieldError message={serverError ?? undefined} />
        {savedMessage ? (
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <CircleCheck className="size-4" aria-hidden />
            {savedMessage}
          </p>
        ) : null}
        <Button type="submit" loading={isSubmitting} loadingText="Saving…" className="self-start">
          Save rule
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Live preview</p>
        <FareCalculator key={`${accountType}-${deliveryType}`} rules={{ [deliveryType]: previewRule }} defaultDeliveryType={deliveryType} />
      </div>
    </div>
  );
};

export default PricingRuleForm;
