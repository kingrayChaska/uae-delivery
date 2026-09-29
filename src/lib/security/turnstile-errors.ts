// Turns a Cloudflare Turnstile client error code into something a person
// can act on. Codes: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
//
// Configuration problems (bad site key, domain not on the key's hostname
// list) can't be fixed by the visitor, so outside development they get a
// generic message and the specific cause goes to the console for whoever
// runs the site.
//
// Visitor messages are translation keys (errors.turnstile.*). The
// development-only configuration hints stay in English: they're for
// whoever runs the site, not for visitors.

export type TurnstileFailure = 'load' | 'timeout' | string;

export const describeTurnstileError = (failure: TurnstileFailure, isDev: boolean): string => {
  if (failure === 'load') return 'errors.turnstile.load';
  if (failure === 'timeout') return 'errors.turnstile.timeout';

  const code = String(failure);

  // 110100/110110: invalid or unknown site key. 110200: this domain isn't
  // allowed for the site key.
  if (code.startsWith('1101') || code.startsWith('1102')) {
    if (!isDev) return 'errors.turnstile.unavailableLater';
    return code.startsWith('1102')
      ? `Turnstile error ${code}: this domain isn't on the site key's hostname list. Add it (e.g. localhost) under Turnstile → your widget → Hostname Management in the Cloudflare dashboard.`
      : `Turnstile error ${code}: the site key is invalid. Check NEXT_PUBLIC_TURNSTILE_SITE_KEY.`;
  }

  // 200xxx: browser/cache problems; 300xxx and 600xxx: the challenge
  // itself failed (often privacy extensions or an unusual browser setup).
  if (code.startsWith('200')) return 'errors.turnstile.blocked';
  if (code.startsWith('300') || code.startsWith('600')) return 'errors.turnstile.browser';

  return 'errors.turnstile.checkFailed';
};
