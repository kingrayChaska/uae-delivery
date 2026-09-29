// Supabase Auth's errors are written for users, but in English. Known ones
// become translation keys (messages/*/auth.json, auth.errors.*); anything
// else is shown as Supabase wrote it.

type AuthErrorLike = { code?: string; message: string };

const BY_CODE: Record<string, string> = {
  user_already_exists: 'auth.errors.alreadyRegistered',
  email_exists: 'auth.errors.alreadyRegistered',
  weak_password: 'auth.errors.weakPassword',
  email_address_invalid: 'auth.errors.invalidEmail',
  validation_failed: 'auth.errors.invalidEmail',
  over_email_send_rate_limit: 'auth.errors.emailRateLimit',
  over_request_rate_limit: 'errors.rateLimited',
  same_password: 'auth.errors.samePassword',
  signup_disabled: 'auth.errors.signupDisabled',
  email_provider_disabled: 'auth.errors.signupDisabled',
};

// Older Supabase versions send no code; match their messages instead.
const BY_MESSAGE: [RegExp, string][] = [
  [/already registered/i, 'auth.errors.alreadyRegistered'],
  [/password should/i, 'auth.errors.weakPassword'],
  [/rate limit/i, 'auth.errors.emailRateLimit'],
  [/should be different from the old password/i, 'auth.errors.samePassword'],
];

export const authErrorMessage = (error: AuthErrorLike): string => {
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  return BY_MESSAGE.find(([pattern]) => pattern.test(error.message))?.[1] ?? error.message;
};
