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
import { useAppLocale } from '@/i18n/hooks';
import { useLoginForm } from '@/lib/hooks/use-login-form';

const LoginForm = () => {
  const {
    register,
    errors,
    isSubmitting,
    isGoogleSubmitting,
    serverError,
    onSubmit,
    signInWithGoogle,
    turnstile,
  } = useLoginForm();
  const t = useTranslations('auth');
  const locale = useAppLocale();

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t('fields.email')}</Label>
        <Input id="email" type="email" autoComplete="email" dir="ltr" className="rtl:text-right" {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t('fields.password')}</Label>
          <Link href={localizeHref('/forgot-password', locale)} className="text-sm text-muted-foreground hover:underline">
            {t('login.forgot')}
          </Link>
        </div>
        <PasswordInput id="password" autoComplete="current-password" {...register('password')} />
        <FieldError message={errors.password?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}

      <TurnstileWidget turnstile={turnstile} />

      <Button type="submit" disabled={isSubmitting || !turnstile.ready}>
        {isSubmitting ? t('login.submitting') : t('login.submit')}
      </Button>

      <div className="relative flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{t('login.or')}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={signInWithGoogle}
        disabled={isSubmitting || isGoogleSubmitting}
      >
        <span className="font-semibold text-[#4285F4]" aria-hidden="true">
          G
        </span>
        {isGoogleSubmitting ? t('login.googleConnecting') : t('login.google')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link href={localizeHref('/register', locale)} className="text-foreground hover:underline">
          {t('login.createOne')}
        </Link>
      </p>
    </form>
  );
};

export default LoginForm;
