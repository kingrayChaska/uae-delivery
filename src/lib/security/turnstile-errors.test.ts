import { describe, expect, it } from 'vitest';

import { describeTurnstileError } from '@/lib/security/turnstile-errors';

describe('describeTurnstileError', () => {
  it('explains a domain missing from the site key in development', () => {
    expect(describeTurnstileError('110200', true)).toMatch(/hostname list/);
  });

  it('explains an invalid site key in development', () => {
    expect(describeTurnstileError('110100', true)).toMatch(/NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it('hides configuration details from visitors in production', () => {
    for (const code of ['110100', '110200']) {
      const message = describeTurnstileError(code, false);
      expect(message).not.toMatch(/Cloudflare|site key|NEXT_PUBLIC/);
      expect(message).toBe('errors.turnstile.unavailableLater');
    }
  });

  it.each([
    ['load', 'errors.turnstile.load'],
    ['timeout', 'errors.turnstile.timeout'],
    ['200500', 'errors.turnstile.blocked'],
    ['300010', 'errors.turnstile.browser'],
    ['600010', 'errors.turnstile.browser'],
    ['999999', 'errors.turnstile.checkFailed'],
  ])('describes %s', (failure, expected) => {
    expect(describeTurnstileError(failure, false)).toBe(expected);
  });
});
