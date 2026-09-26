// Pure pieces of Cloudflare Turnstile verification, kept free of
// server-only imports so they're unit-testable.

export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileMode = "enforced" | "disabled" | "misconfigured";

// Enforced whenever a secret key is configured. Without one, it's only
// allowed to be off outside production, or when TURNSTILE_DISABLED=true is
// set explicitly — a production deploy that simply forgot the key fails
// closed ('misconfigured') instead of silently dropping bot protection.
export const getTurnstileMode = (env: {
  secret?: string;
  disabled?: string;
  nodeEnv?: string;
}): TurnstileMode => {
  if (env.disabled === "true") return "disabled";
  if (env.secret) return "enforced";
  if (env.nodeEnv !== "production") return "disabled";
  return "misconfigured";
};

export const buildTurnstileBody = (
  secret: string,
  token: string,
  remoteIp?: string | null,
) => {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  return body;
};

export const isTurnstileSuccess = (json: unknown): boolean =>
  typeof json === "object" &&
  json !== null &&
  (json as { success?: unknown }).success === true;
