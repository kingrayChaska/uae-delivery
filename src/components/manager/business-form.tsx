'use client';

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
  const { register, errors, isSubmitting, serverError, saved, onSubmit } = useBusinessForm(businessId, defaultValues);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="companyName" label="Company name" error={errors.companyName?.message} {...register('companyName')} />
        <Field id="contactPerson" label="Contact person" error={errors.contactPerson?.message} {...register('contactPerson')} />
        <Field id="contactEmail" type="email" label="Contact email" error={errors.contactEmail?.message} {...register('contactEmail')} />
        <Field id="contactPhone" type="tel" label="Contact phone" error={errors.contactPhone?.message} {...register('contactPhone')} />
        <Field id="billingAddress" label="Billing address" {...register('billingAddress')} />
        <Field id="trn" label="TRN (VAT registration, optional)" {...register('trn')} />
      </div>
      <FieldError message={serverError ?? undefined} />
      {saved ? <p className="text-sm text-success">Saved.</p> : null}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Saving…' : businessId ? 'Save changes' : 'Create business account'}
      </Button>
    </form>
  );
};

export default BusinessForm;
