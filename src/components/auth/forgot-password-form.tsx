'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import TurnstileWidget from '@/components/security/turnstile-widget';
import { localizeHref } from '@/i18n/config';
import { useAppLocale, useMessage } from '@/i18n/hooks';
import { useForgotPasswordForm } from '@/lib/hooks/use-forgot-password-form';

const ForgotPasswordForm = () => {
  const { register, errors, isSubmitting, serverError, successMessage, onSubmit, turnstile } =
    useForgotPasswordForm();
  const t = useTranslations('auth');
  const locale = useAppLocale();
  const translate = useMessage();

  if (successMessage) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-lg font-medium">{t('forgot.checkEmailTitle')}</p>
        <p className="text-muted-foreground">{translate(successMessage)}</p>
        <Link href={localizeHref('/login', locale)} className="text-sm text-foreground hover:underline">
          {t('backToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t('fields.email')}</Label>
        <Input id="email" type="email" autoComplete="email" dir="ltr" className="rtl:text-right" {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}

      <TurnstileWidget turnstile={turnstile} />

      <Button type="submit" disabled={isSubmitting || !turnstile.ready}>
        {isSubmitting ? t('forgot.submitting') : t('forgot.submit')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('forgot.remembered')}{' '}
        <Link href={localizeHref('/login', locale)} className="text-foreground hover:underline">
          {t('forgot.signIn')}
        </Link>
      </p>
    </form>
  );
};

export default ForgotPasswordForm;
