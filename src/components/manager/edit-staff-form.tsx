'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Field from '@/components/manager/field';
import { useEditStaffForm } from '@/lib/hooks/use-edit-staff-form';

import type { UpdateStaffInput } from '@/lib/staff/schemas';

type EditStaffFormProps = {
  role: 'operator' | 'driver';
  defaultValues: UpdateStaffInput;
};

const EditStaffForm = ({ role, defaultValues }: EditStaffFormProps) => {
  const t = useTranslations('manager.staff.form');
  const { register, errors, isSubmitting, serverError, saved, onSubmit } = useEditStaffForm(defaultValues);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label={t('fullName')} error={errors.fullName?.message} {...register('fullName')} />
        <Field id="phone" type="tel" dir="ltr" className="rtl:text-right" label={t('phone')} error={errors.phone?.message} {...register('phone')} />
        {role === 'operator' ? (
          <Field id="employeeId" label={t('employeeId')} {...register('employeeId')} />
        ) : (
          <>
            <Field id="driverCode" label={t('driverId')} {...register('driverCode')} />
            <Field id="licenseNumber" label={t('licenseNumber')} {...register('licenseNumber')} />
          </>
        )}
      </div>
      <FieldError message={serverError ?? undefined} />
      {saved ? <p className="text-sm text-success">{t('saved')}</p> : null}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? t('saving') : t('save')}
      </Button>
    </form>
  );
};

export default EditStaffForm;
