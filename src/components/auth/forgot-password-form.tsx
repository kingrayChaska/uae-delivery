'use client';

import Link from 'next/link';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import TurnstileWidget from '@/components/security/turnstile-widget';
import { useForgotPasswordForm } from '@/lib/hooks/use-forgot-password-form';

const ForgotPasswordForm = () => {
  const { register, errors, isSubmitting, serverError, successMessage, onSubmit, turnstile } =
    useForgotPasswordForm();

  if (successMessage) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-lg font-medium">Check your email</p>
        <p className="text-muted-foreground">{successMessage}</p>
        <Link href="/login" className="text-sm text-foreground hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}

      <TurnstileWidget turnstile={turnstile} />

      <Button type="submit" disabled={isSubmitting || !turnstile.ready}>
        {isSubmitting ? 'Sending…' : 'Send Reset Link'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
};

export default ForgotPasswordForm;
