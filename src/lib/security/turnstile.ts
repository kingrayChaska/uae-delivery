import 'server-only';

import {
  TURNSTILE_VERIFY_URL,
  buildTurnstileBody,
  getTurnstileMode,
  isTurnstileSuccess,
} from '@/lib/security/turnstile-core';
import { getClientIp } from '@/lib/security/request-context';

export type TurnstileResult = { ok: true } | { ok: false; error: string };

export const verifyTurnstile = async (token: string | null | undefined): Promise<TurnstileResult> => {
  const mode = getTurnstileMode({
    secret: process.env.TURNSTILE_SECRET_KEY,
    disabled: process.env.TURNSTILE_DISABLED,
    nodeEnv: process.env.NODE_ENV,
  });

  if (mode === 'disabled') return { ok: true };
  if (mode === 'misconfigured') {
    console.error('TURNSTILE_SECRET_KEY is not set in production — refusing protected requests.');
    return { ok: false, error: 'Verification is temporarily unavailable. Please try again later.' };
  }
  if (!token) return { ok: false, error: 'Please complete the verification check.' };

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: buildTurnstileBody(process.env.TURNSTILE_SECRET_KEY as string, token, await getClientIp()),
    });
    const json: unknown = await response.json();
    return isTurnstileSuccess(json)
      ? { ok: true }
      : { ok: false, error: 'Verification failed. Please try again.' };
  } catch {
    return { ok: false, error: 'Verification is temporarily unavailable. Please try again.' };
  }
};
