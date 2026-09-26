'use client';

import Link from 'next/link';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import PasswordInput from '@/components/ui/password-input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import TurnstileWidget from '@/components/security/turnstile-widget';
import { useRegisterForm } from '@/lib/hooks/use-register-form';

const RegisterForm = () => {
  const { register, errors, isSubmitting, serverError, successMessage, onSubmit, turnstile } = useRegisterForm();

  if (successMessage) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-lg font-medium">Almost there</p>
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
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" autoComplete="name" {...register('fullName')} />
        <FieldError message={errors.fullName?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input id="phone" type="tel" autoComplete="tel" {...register('phone')} />
        <FieldError message={errors.phone?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" autoComplete="new-password" {...register('password')} />
        <FieldError message={errors.password?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
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
        {isSubmitting ? 'Creating account…' : 'Create Account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
};

export default RegisterForm;
