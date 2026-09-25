'use client';

import Button from '@/components/ui/button';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import Field from '@/components/manager/field';
import { useCreateStaffForm } from '@/lib/hooks/use-create-staff-form';

import type { StaffRole } from '@/lib/staff/schemas';

const CreateStaffForm = ({ role }: { role: StaffRole }) => {
  const { register, errors, isSubmitting, method, serverError, onSubmit } = useCreateStaffForm(role);

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6" noValidate>
      <input type="hidden" {...register('role')} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label="Full name" error={errors.fullName?.message} {...register('fullName')} />
        <Field id="email" type="email" label="Email" error={errors.email?.message} {...register('email')} />
        <Field id="phone" type="tel" label="Phone" error={errors.phone?.message} {...register('phone')} />
        {role === 'operator' ? (
          <Field id="employeeId" label="Employee ID" error={errors.employeeId?.message} {...register('employeeId')} />
        ) : (
          <Field id="driverCode" label="Driver ID" error={errors.driverCode?.message} {...register('driverCode')} />
        )}
      </section>

      {role === 'driver' ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">License</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="licenseNumber" label="License number" error={errors.licenseNumber?.message} {...register('licenseNumber')} />
            <Field id="licenseExpiry" type="date" label="License expiry (optional)" {...register('licenseExpiry')} />
          </div>
          <h2 className="text-sm font-medium">Vehicle (optional)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="vehicleType" label="Type" placeholder="Van, motorbike…" {...register('vehicleType')} />
            <Field id="vehicleMake" label="Make" {...register('vehicleMake')} />
            <Field id="vehicleModel" label="Model" {...register('vehicleModel')} />
            <Field id="plateNumber" label="Plate number" error={errors.plateNumber?.message} {...register('plateNumber')} />
            <Field id="registrationNumber" label="Registration number" {...register('registrationNumber')} />
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <Label>How should they get access?</Label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" value="invite" className="mt-1" {...register('method')} />
          <span>
            <span className="font-medium">Email invitation</span>
            <span className="block text-muted-foreground">They receive a link and choose their own password.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" value="password" className="mt-1" {...register('method')} />
          <span>
            <span className="font-medium">Temporary password</span>
            <span className="block text-muted-foreground">
              You set a password and share it securely; they can change it from the login page.
            </span>
          </span>
        </label>
        {method === 'password' ? (
          <Field
            id="password"
            type="password"
            autoComplete="new-password"
            label="Temporary password"
            error={errors.password?.message}
            {...register('password')}
          />
        ) : null}
      </section>

      <FieldError message={serverError ?? undefined} />

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Creating…' : `Create ${role}`}
      </Button>
    </form>
  );
};

export default CreateStaffForm;
