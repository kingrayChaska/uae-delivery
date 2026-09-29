'use client';

import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Checkbox from '@/components/ui/checkbox';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import FieldError from '@/components/ui/field-error';
import Field from '@/components/manager/field';
import FareCalculator from '@/components/pricing/fare-calculator';
import { usePricingRuleForm } from '@/lib/hooks/use-pricing-rule-form';
import { ACCOUNT_TYPES, DELIVERY_TYPES } from '@/lib/types';
import { useMessage } from '@/i18n/hooks';

import type { AccountType, DeliveryType, PricingRuleSet } from '@/lib/types';

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
  const t = useTranslations('manager.pricing');
  const tShipments = useTranslations('shipments.deliveryType');
  const translate = useMessage();

  const number = { valueAsNumber: true } as const;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountType">{t('form.appliesTo')}</Label>
            <Select
              id="accountType"
              value={accountType}
              onChange={(event) => selectTarget(event.target.value as AccountType, deliveryType)}
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`accountsLong.${type}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deliveryType">{t('form.service')}</Label>
            <Select
              id="deliveryType"
              value={deliveryType}
              onChange={(event) => selectTarget(accountType, event.target.value as DeliveryType)}
            >
              {DELIVERY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {tShipments(`${type}.label`)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Field id="name" label={t('form.name')} placeholder={t('form.namePlaceholder')} error={errors.name?.message} {...register('name')} />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">{t('form.distance')}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="baseDistanceKm" type="number" step="0.1" min={0} label={t('form.includedKm')} error={errors.baseDistanceKm?.message} {...register('baseDistanceKm', number)} />
            <Field id="basePrice" type="number" step="0.01" min={0} label={t('form.basePrice')} error={errors.basePrice?.message} {...register('basePrice', number)} />
            <Field id="additionalPricePerKm" type="number" step="0.01" min={0} label={t('form.perKm')} error={errors.additionalPricePerKm?.message} {...register('additionalPricePerKm', number)} />
          </div>
          <p className="text-xs text-muted-foreground">{t('form.flatHint')}</p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">{t('form.weight')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="includedWeightKg" type="number" step="0.5" min={0} label={t('form.includedWeight')} error={errors.includedWeightKg?.message} {...register('includedWeightKg', number)} />
            <Field id="additionalPricePerKg" type="number" step="0.01" min={0} label={t('form.perKg')} error={errors.additionalPricePerKg?.message} {...register('additionalPricePerKg', number)} />
            <Field id="codFee" type="number" step="0.01" min={0} label={t('form.codFee')} error={errors.codFee?.message} {...register('codFee', number)} />
            <Field id="maxDistanceKm" type="number" step="1" min={1} label={t('form.maxDistance')} error={errors.maxDistanceKm?.message} {...register('maxDistanceKm', number)} />
          </div>
        </fieldset>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox className="size-5" {...register('activate')} />
          {t('form.makeActive', { account: t(`accountsLong.${accountType}`), service: tShipments(`${deliveryType}.label`) })}
        </label>
        <p className="text-xs text-muted-foreground">{t('form.neverEdited')}</p>
        <FieldError message={serverError ?? undefined} />
        {savedMessage ? (
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <CircleCheck className="size-4" aria-hidden />
            {translate(savedMessage)}
          </p>
        ) : null}
        <Button type="submit" loading={isSubmitting} loadingText={t('form.saving')} className="self-start">
          {t('form.save')}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t('form.preview')}</p>
        <FareCalculator key={`${accountType}-${deliveryType}`} rules={{ [deliveryType]: previewRule }} defaultDeliveryType={deliveryType} />
      </div>
    </div>
  );
};

export default PricingRuleForm;
