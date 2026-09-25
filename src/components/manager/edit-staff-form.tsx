'use client';

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
  const { register, errors, isSubmitting, serverError, saved, onSubmit } = useEditStaffForm(defaultValues);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label="Full name" error={errors.fullName?.message} {...register('fullName')} />
        <Field id="phone" type="tel" label="Phone" error={errors.phone?.message} {...register('phone')} />
        {role === 'operator' ? (
          <Field id="employeeId" label="Employee ID" {...register('employeeId')} />
        ) : (
          <>
            <Field id="driverCode" label="Driver ID" {...register('driverCode')} />
            <Field id="licenseNumber" label="License number" {...register('licenseNumber')} />
          </>
        )}
      </div>
      <FieldError message={serverError ?? undefined} />
      {saved ? <p className="text-sm text-success">Saved.</p> : null}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
};

export default EditStaffForm;
