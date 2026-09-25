'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { createStaffAction } from '@/lib/staff/actions';
import { createStaffSchema } from '@/lib/staff/schemas';

import type { CreateStaffInput, StaffRole } from '@/lib/staff/schemas';

export const useCreateStaffForm = (role: StaffRole) => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateStaffInput>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: {
      role,
      fullName: '',
      email: '',
      phone: '',
      method: 'invite',
      password: '',
      employeeId: '',
      driverCode: '',
      licenseNumber: '',
      licenseExpiry: '',
      vehicleType: '',
      vehicleMake: '',
      vehicleModel: '',
      plateNumber: '',
      registrationNumber: '',
    },
  });

  const method = useWatch({ control: form.control, name: 'method' });

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    const result = await createStaffAction(input);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    router.push(`/dashboard/manager/${role}s/${result.profileId}`);
  });

  return {
    register: form.register,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    method,
    serverError,
    onSubmit,
  };
};
