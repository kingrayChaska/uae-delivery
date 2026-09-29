'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import { useProfileForm } from '@/lib/hooks/use-profile-form';
import { useMessage } from '@/i18n/hooks';

import type { UpdateProfileInput } from '@/lib/auth/schemas';

type ProfileFormProps = {
  defaultValues: UpdateProfileInput;
  email: string;
};

const ProfileForm = ({ defaultValues, email }: ProfileFormProps) => {
  const { register, errors, isSubmitting, serverError, successMessage, onSubmit } =
    useProfileForm(defaultValues);
  const t = useTranslations('customer.profile');
  const translate = useMessage();

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label>{t('email')}</Label>
        <p dir="ltr" className="text-sm text-muted-foreground rtl:text-right">
          {email}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">{t('fullName')}</Label>
        <Input id="fullName" {...register('fullName')} />
        <FieldError message={errors.fullName?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">{t('phone')}</Label>
        <Input id="phone" type="tel" dir="ltr" className="rtl:text-right" {...register('phone')} />
        <FieldError message={errors.phone?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}
      {successMessage ? <p className="text-sm text-success">{translate(successMessage)}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? t('saving') : t('save')}
      </Button>
    </form>
  );
};

export default ProfileForm;
