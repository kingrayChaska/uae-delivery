'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Field from '@/components/manager/field';
import { useBusinessForm } from '@/lib/hooks/use-business-form';

import type { BusinessAccountInput } from '@/lib/business/schemas';

type BusinessFormProps = {
  businessId?: string;
  defaultValues?: BusinessAccountInput;
};

const BusinessForm = ({ businessId, defaultValues }: BusinessFormProps) => {
  const t = useTranslations('manager.business.form');
  const { register, errors, isSubmitting, serverError, saved, onSubmit } = useBusinessForm(businessId, defaultValues);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="companyName" label={t('companyName')} error={errors.companyName?.message} {...register('companyName')} />
        <Field id="contactPerson" label={t('contactPerson')} error={errors.contactPerson?.message} {...register('contactPerson')} />
        <Field id="contactEmail" type="email" dir="ltr" className="rtl:text-right" label={t('contactEmail')} error={errors.contactEmail?.message} {...register('contactEmail')} />
        <Field id="contactPhone" type="tel" dir="ltr" className="rtl:text-right" label={t('contactPhone')} error={errors.contactPhone?.message} {...register('contactPhone')} />
        <Field id="billingAddress" label={t('billingAddress')} {...register('billingAddress')} />
        <Field id="trn" label={t('trn')} dir="ltr" className="rtl:text-right" {...register('trn')} />
      </div>
      <FieldError message={serverError ?? undefined} />
      {saved ? <p className="text-sm text-success">{t('saved')}</p> : null}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? t('saving') : businessId ? t('save') : t('create')}
      </Button>
    </form>
  );
};

export default BusinessForm;
