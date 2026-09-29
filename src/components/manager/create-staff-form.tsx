'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import Field from '@/components/manager/field';
import { useCreateStaffForm } from '@/lib/hooks/use-create-staff-form';

import type { StaffRole } from '@/lib/staff/schemas';

const CreateStaffForm = ({ role }: { role: StaffRole }) => {
  const t = useTranslations('manager.staff.form');
  const { register, errors, isSubmitting, method, serverError, onSubmit } = useCreateStaffForm(role);

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6" noValidate>
      <input type="hidden" {...register('role')} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label={t('fullName')} error={errors.fullName?.message} {...register('fullName')} />
        <Field id="email" type="email" dir="ltr" className="rtl:text-right" label={t('email')} error={errors.email?.message} {...register('email')} />
        <Field id="phone" type="tel" dir="ltr" className="rtl:text-right" label={t('phone')} error={errors.phone?.message} {...register('phone')} />
        {role === 'operator' ? (
          <Field id="employeeId" label={t('employeeId')} error={errors.employeeId?.message} {...register('employeeId')} />
        ) : (
          <Field id="driverCode" label={t('driverId')} error={errors.driverCode?.message} {...register('driverCode')} />
        )}
      </section>

      {role === 'driver' ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">{t('license')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="licenseNumber" label={t('licenseNumber')} error={errors.licenseNumber?.message} {...register('licenseNumber')} />
            <Field id="licenseExpiry" type="date" label={t('licenseExpiry')} {...register('licenseExpiry')} />
          </div>
          <h2 className="text-sm font-medium">{t('vehicleOptional')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="vehicleType" label={t('vehicleType')} placeholder={t('vehicleTypePlaceholder')} {...register('vehicleType')} />
            <Field id="vehicleMake" label={t('vehicleMake')} {...register('vehicleMake')} />
            <Field id="vehicleModel" label={t('vehicleModel')} {...register('vehicleModel')} />
            <Field id="plateNumber" label={t('plateNumber')} error={errors.plateNumber?.message} {...register('plateNumber')} />
            <Field id="registrationNumber" label={t('registrationNumber')} {...register('registrationNumber')} />
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <Label>{t('accessQuestion')}</Label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" value="invite" className="mt-1" {...register('method')} />
          <span>
            <span className="font-medium">{t('invite')}</span>
            <span className="block text-muted-foreground">{t('inviteHint')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" value="password" className="mt-1" {...register('method')} />
          <span>
            <span className="font-medium">{t('password')}</span>
            <span className="block text-muted-foreground">{t('passwordHint')}</span>
          </span>
        </label>
        {method === 'password' ? (
          <Field
            id="password"
            type="password"
            autoComplete="new-password"
            label={t('password')}
            error={errors.password?.message}
            {...register('password')}
          />
        ) : null}
      </section>

      <FieldError message={serverError ?? undefined} />

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? t('creating') : role === 'driver' ? t('createDriver') : t('createOperator')}
      </Button>
    </form>
  );
};

export default CreateStaffForm;
