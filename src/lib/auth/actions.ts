'use server';

import { DASHBOARD_HOME } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { RATE_LIMIT_MESSAGE, checkIpRateLimit, checkRateLimit } from '@/lib/security/rate-limit';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@/lib/auth/schemas';

import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from '@/lib/auth/schemas';
import type { Role } from '@/lib/types';

// Actions return a redirectTo path rather than calling next/navigation's
// redirect() themselves. These are invoked imperatively from client hooks
// (not <form action={...}>), and redirect()'s special throw-based signal
// is easy to accidentally swallow inside a hook's try/catch — returning a
// path and letting the client call router.push() is simpler and safer.
export type AuthActionResult =
  | { success: true; redirectTo?: string; message?: string }
  | { success: false; error: string };

const getAppUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Customer self-registration only — this is the ONLY signup path reachable
// from a browser. Staff (driver/operator/manager) accounts are created by
// a Manager-only server action using the service-role client (Phase 10),
// never through this form. The handle_new_user DB trigger also hard-codes
// role='customer' regardless of what's sent here, so even a forged request
// against this action can't grant itself a different role.
export const registerAction = async (input: RegisterInput, turnstileToken?: string): Promise<AuthActionResult> => {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const human = await verifyTurnstile(turnstileToken);
  if (!human.ok) return { success: false, error: human.error };
  if (!(await checkIpRateLimit('registerPerIp'))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const { fullName, email, phone, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
      emailRedirectTo: `${getAppUrl()}/auth/callback`,
    },
  });

  // Supabase Auth's own messages ('Password should be at least 6 characters')
  // are written for users; it's database errors that must not leak.
  if (error) return { success: false, error: error.message };

  // If the Supabase project has email confirmation disabled, signUp
  // returns an active session immediately — otherwise the account exists
  // but is unconfirmed until the emailed link is clicked.
  if (data.session) {
    return { success: true, redirectTo: DASHBOARD_HOME.customer };
  }

  return {
    success: true,
    message: 'Check your email to confirm your account before signing in.',
  };
};

export const loginAction = async (input: LoginInput, turnstileToken?: string): Promise<AuthActionResult> => {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const human = await verifyTurnstile(turnstileToken);
  if (!human.ok) return { success: false, error: human.error };

  // Per-IP stops one source hammering many accounts; per-email stops a
  // distributed attack (many IPs) guessing one account's password. Supabase
  // Auth's own rate limits are per calling IP — and every request here comes
  // from this server's IP — so they can't do either job on their own.
  const [ipOk, emailOk] = await Promise.all([
    checkIpRateLimit('loginPerIp'),
    checkRateLimit('loginPerEmail', parsed.data.email),
  ]);
  if (!ipOk || !emailOk) return { success: false, error: RATE_LIMIT_MESSAGE };

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { success: false, error: 'Incorrect email or password' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', data.user.id)
    .single();

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return { success: false, error: 'This account is not active. Contact support.' };
  }

  return { success: true, redirectTo: DASHBOARD_HOME[profile.role as Role] };
};

export const signOutAction = async (): Promise<AuthActionResult> => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true, redirectTo: '/' };
};

export const requestPasswordResetAction = async (
  input: ForgotPasswordInput,
  turnstileToken?: string,
): Promise<AuthActionResult> => {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const human = await verifyTurnstile(turnstileToken);
  if (!human.ok) return { success: false, error: human.error };
  const [ipOk, emailOk] = await Promise.all([
    checkIpRateLimit('passwordResetPerIp'),
    checkRateLimit('passwordResetPerEmail', parsed.data.email),
  ]);
  if (!ipOk || !emailOk) return { success: false, error: RATE_LIMIT_MESSAGE };

  const supabase = await createClient();

  // Deliberately return the same success message whether or not the email
  // is registered — an error here would let someone enumerate accounts.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getAppUrl()}/auth/confirm`,
  });

  return {
    success: true,
    message: 'If an account exists for that email, a reset link is on its way.',
  };
};

// Called from /reset-password, where the person already has a temporary
// "recovery" session established by clicking the emailed link (see
// app/auth/callback/route.ts). This just sets the new password on that
// already-authenticated session — it never receives or trusts a password
// reset token directly from client input.
export const updatePasswordAction = async (input: ResetPasswordInput): Promise<AuthActionResult> => {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Reset link expired. Request a new one.' };
  if (!(await checkRateLimit('passwordUpdatePerUser', user.id))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { success: false, error: error.message };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  return { success: true, redirectTo: profile ? DASHBOARD_HOME[profile.role as Role] : '/login' };
};

// Display-only fields (full name, phone) — role/active are locked out by
// the prevent_profile_privilege_escalation trigger (migration 0002) even
// though the customer's own RLS update policy would otherwise allow the
// row-level update.
export const updateProfileAction = async (input: UpdateProfileInput): Promise<AuthActionResult> => {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in' };

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq('id', user.id);

  if (error) return { success: false, error: safeErrorMessage(error) };
  return { success: true };
};
