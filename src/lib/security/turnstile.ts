import "server-only";

import {
  TURNSTILE_VERIFY_URL,
  buildTurnstileBody,
  getTurnstileMode,
  isTurnstileSuccess,
} from "@/lib/security/turnstile-core";
import { getClientIp } from "@/lib/security/request-context";

export type TurnstileResult = { ok: true } | { ok: false; error: string };

export const verifyTurnstile = async (
  token: string | null | undefined,
): Promise<TurnstileResult> => {
  const mode = getTurnstileMode({
    secret: process.env.TURNSTILE_SECRET_KEY,
    disabled: process.env.TURNSTILE_DISABLED,
    nodeEnv: process.env.NODE_ENV,
  });

  if (mode === "disabled") return { ok: true };
  if (mode === "misconfigured") {
    console.error(
      "TURNSTILE_SECRET_KEY is not set in production — refusing protected requests.",
    );
    return {
      ok: false,
      error: "errors.turnstile.unavailableLater",
    };
  }
  if (!token) return { ok: false, error: "errors.turnstile.required" };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      signal: controller.signal,
      body: buildTurnstileBody(
        process.env.TURNSTILE_SECRET_KEY as string,
        token,
        await getClientIp(),
      ),
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.error(
        "Turnstile verification request failed with status",
        response.status,
      );
      return {
        ok: false,
        error: "errors.turnstile.unavailableLater",
      };
    }
    const json: unknown = await response.json();
    return isTurnstileSuccess(json)
      ? { ok: true }
      : { ok: false, error: "errors.turnstile.failed" };
  } catch (error) {
    console.error(
      "Turnstile verification request failed",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      error: "errors.turnstile.unavailable",
    };
  }
};
