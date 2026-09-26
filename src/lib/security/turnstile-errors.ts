// Turns a Cloudflare Turnstile client error code into something a person
// can act on. Codes: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
//
// Configuration problems (bad site key, domain not on the key's hostname
// list) can't be fixed by the visitor, so outside development they get a
// generic message and the specific cause goes to the console for whoever
// runs the site.

export type TurnstileFailure = 'load' | 'timeout' | string;

const LOAD_MESSAGE =
  "The verification check couldn't load. Check your connection, disable content blockers for this site, and try again.";

export const describeTurnstileError = (failure: TurnstileFailure, isDev: boolean): string => {
  if (failure === 'load') return LOAD_MESSAGE;
  if (failure === 'timeout') return 'The verification check timed out. Please try again.';

  const code = String(failure);

  // 110100/110110: invalid or unknown site key. 110200: this domain isn't
  // allowed for the site key.
  if (code.startsWith('1101') || code.startsWith('1102')) {
    if (!isDev) return 'Verification is temporarily unavailable. Please try again later.';
    return code.startsWith('1102')
      ? `Turnstile error ${code}: this domain isn't on the site key's hostname list. Add it (e.g. localhost) under Turnstile → your widget → Hostname Management in the Cloudflare dashboard.`
      : `Turnstile error ${code}: the site key is invalid. Check NEXT_PUBLIC_TURNSTILE_SITE_KEY.`;
  }

  // 200xxx: browser/cache problems; 300xxx and 600xxx: the challenge
  // itself failed (often privacy extensions or an unusual browser setup).
  if (code.startsWith('200')) return 'Your browser blocked the verification check. Refresh the page and try again.';
  if (code.startsWith('300') || code.startsWith('600')) {
    return "We couldn't verify your browser. Try again, or try a different browser or network.";
  }

  return 'The verification check failed. Please try again.';
};
