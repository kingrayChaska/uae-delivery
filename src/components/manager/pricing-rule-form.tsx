'use client';

import Button from '@/components/ui/button';
import Checkbox from '@/components/ui/checkbox';
import FieldError from '@/components/ui/field-error';
import Field from '@/components/manager/field';
import FareCalculator from '@/components/pricing/fare-calculator';
import { usePricingRuleForm } from '@/lib/hooks/use-pricing-rule-form';

import type { PricingRule } from '@/lib/types';

const PricingRuleForm = ({ current }: { current: PricingRule }) => {
  const { register, errors, isSubmitting, serverError, previewRule, onSubmit } = usePricingRuleForm(current);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field id="name" label="Rule name" placeholder="e.g. Standard 2027" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-3 gap-3">
          <Field
            id="baseDistanceKm"
            type="number"
            step="0.1"
            min={0}
            label="Base km"
            error={errors.baseDistanceKm?.message}
            {...register('baseDistanceKm', { valueAsNumber: true })}
          />
          <Field
            id="basePrice"
            type="number"
            step="0.01"
            min={0}
            label="Base price (AED)"
            error={errors.basePrice?.message}
            {...register('basePrice', { valueAsNumber: true })}
          />
          <Field
            id="additionalPricePerKm"
            type="number"
            step="0.01"
            min={0}
            label="Per extra km"
            error={errors.additionalPricePerKm?.message}
            {...register('additionalPricePerKm', { valueAsNumber: true })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...register('activate')} />
          Make this the active rule immediately
        </label>
        <p className="text-xs text-muted-foreground">
          Rules are never edited in place — existing shipments keep the rule they were priced under.
        </p>
        <FieldError message={serverError ?? undefined} />
        <Button type="submit" disabled={isSubmitting} className="self-start">
          {isSubmitting ? 'Saving…' : 'Save rule'}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Preview</p>
        <FareCalculator rule={previewRule} />
      </div>
    </div>
  );
};

export default PricingRuleForm;
