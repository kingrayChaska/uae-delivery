'use client';

import Link from 'next/link';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import PasswordInput from '@/components/ui/password-input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import TurnstileWidget from '@/components/security/turnstile-widget';
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

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" autoComplete="current-password" {...register('password')} />
        <FieldError message={errors.password?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}

      <TurnstileWidget turnstile={turnstile} />

      <Button type="submit" disabled={isSubmitting || !turnstile.ready}>
        {isSubmitting ? 'Signing in…' : 'Sign In'}
      </Button>

      <div className="relative flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">OR</span>
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
        {isGoogleSubmitting ? 'Connecting…' : 'Continue with Google'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-foreground hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
};

export default LoginForm;
