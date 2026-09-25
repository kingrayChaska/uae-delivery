'use client';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import { useProfileForm } from '@/lib/hooks/use-profile-form';

import type { UpdateProfileInput } from '@/lib/auth/schemas';

type ProfileFormProps = {
  defaultValues: UpdateProfileInput;
  email: string;
};

const ProfileForm = ({ defaultValues, email }: ProfileFormProps) => {
  const { register, errors, isSubmitting, serverError, successMessage, onSubmit } =
    useProfileForm(defaultValues);

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label>Email</Label>
        <p className="text-sm text-muted-foreground">{email}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" {...register('fullName')} />
        <FieldError message={errors.fullName?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input id="phone" type="tel" {...register('phone')} />
        <FieldError message={errors.phone?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}
      {successMessage ? <p className="text-sm text-success">{successMessage}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Saving…' : 'Save Changes'}
      </Button>
    </form>
  );
};

export default ProfileForm;
