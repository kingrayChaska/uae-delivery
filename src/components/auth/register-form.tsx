'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import PasswordInput from '@/components/ui/password-input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import TurnstileWidget from '@/components/security/turnstile-widget';
import { localizeHref } from '@/i18n/config';
import { useAppLocale, useMessage } from '@/i18n/hooks';
import { useRegisterForm } from '@/lib/hooks/use-register-form';

const RegisterForm = () => {
  const { register, errors, isSubmitting, serverError, successMessage, onSubmit, turnstile } = useRegisterForm();
  const t = useTranslations('auth');
  const locale = useAppLocale();
  const translate = useMessage();

  if (successMessage) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-lg font-medium">{t('register.almostThere')}</p>
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
        <Label htmlFor="fullName">{t('fields.fullName')}</Label>
        <Input id="fullName" autoComplete="name" {...register('fullName')} />
        <FieldError message={errors.fullName?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t('fields.email')}</Label>
        <Input id="email" type="email" autoComplete="email" dir="ltr" className="rtl:text-right" {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">{t('fields.phone')}</Label>
        <Input id="phone" type="tel" autoComplete="tel" dir="ltr" className="rtl:text-right" {...register('phone')} />
        <FieldError message={errors.phone?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t('fields.password')}</Label>
        <PasswordInput id="password" autoComplete="new-password" {...register('password')} />
        <FieldError message={errors.password?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">{t('fields.confirmPassword')}</Label>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          {...register('confirmPassword')}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}

      <TurnstileWidget turnstile={turnstile} />

      <Button type="submit" disabled={isSubmitting || !turnstile.ready}>
        {isSubmitting ? t('register.submitting') : t('register.submit')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('register.haveAccount')}{' '}
        <Link href={localizeHref('/login', locale)} className="text-foreground hover:underline">
          {t('register.signIn')}
        </Link>
      </p>
    </form>
  );
};

export default RegisterForm;
