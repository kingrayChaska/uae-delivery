'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import PasswordInput from '@/components/ui/password-input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import { useResetPasswordForm } from '@/lib/hooks/use-reset-password-form';

const ResetPasswordForm = () => {
  const { register, errors, isSubmitting, serverError, onSubmit } = useResetPasswordForm();
  const t = useTranslations('auth.reset');

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t('newPassword')}</Label>
        <PasswordInput id="password" autoComplete="new-password" {...register('password')} />
        <FieldError message={errors.password?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">{t('confirmNewPassword')}</Label>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          {...register('confirmPassword')}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
};

export default ResetPasswordForm;
