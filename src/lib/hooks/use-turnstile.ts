"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { describeTurnstileError } from "@/lib/security/turnstile-errors";

import type { TurnstileFailure } from "@/lib/security/turnstile-errors";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// A script blocked by a network filter sometimes never fires onerror; this
// turns an endless wait into a visible, retryable error.
const SCRIPT_TIMEOUT_MS = 15_000;

const isDev = process.env.NODE_ENV !== "production";

let scriptPromise: Promise<TurnstileApi> | null = null;

// Loaded on demand from inside our own (nonce-trusted) bundle, which the
// Content-Security-Policy's 'strict-dynamic' allows — no extra nonce
// plumbing needed. One shared promise so several forms on a page don't
// each inject the script; a failed load is forgotten so a retry can try
// again.
const loadTurnstile = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      const fail = (message: string) => {
        window.clearTimeout(timer);
        script.remove();
        scriptPromise = null;
        reject(new Error(message));
      };
      const timer = window.setTimeout(
        () => fail("Turnstile load timed out"),
        SCRIPT_TIMEOUT_MS,
      );

      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timer);
        if (window.turnstile) resolve(window.turnstile);
        else fail("Turnstile unavailable");
      };
      script.onerror = () => fail("Turnstile failed to load");
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
};

export const useTurnstile = () => {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const enabled =
    Boolean(siteKey) && process.env.NEXT_PUBLIC_TURNSTILE_DISABLED !== "true";
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failure, setFailure] = useState<TurnstileFailure | null>(null);
  // Bumped by retry() to tear the widget down and render a fresh one.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    let cancelled = false;

    const fail = (reason: TurnstileFailure) => {
      if (cancelled) return;
      setToken(null);
      setFailure(reason);
    };

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        try {
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme: "auto",
            // Let Turnstile quietly re-issue expired tokens and retry
            // transient failures itself before we surface an error.
            "refresh-expired": "auto",
            retry: "auto",
            callback: (value: string) => {
              setFailure(null);
              setToken(value);
            },
            "expired-callback": () => setToken(null),
            "timeout-callback": () => fail("timeout"),
            "error-callback": (code: string) => {
              console.error("Turnstile error:", code);
              fail(code);
              // Returning true tells Turnstile we've handled the error, so it
              // doesn't also throw it as an uncaught exception.
              return true;
            },
          });
        } catch (error) {
          console.error("Turnstile render failed:", error);
          fail("load");
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        fail("load");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile)
        window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [enabled, siteKey, attempt]);

  // Tokens are single-use: after every submission (pass or fail) the widget
  // must issue a fresh one.
  const reset = useCallback(() => {
    setToken(null);
    if (widgetIdRef.current && window.turnstile)
      window.turnstile.reset(widgetIdRef.current);
  }, []);

  // After an error: forget it and render the widget from scratch (reloading
  // the script too, if that's what failed).
  const retry = useCallback(() => {
    setToken(null);
    setFailure(null);
    setAttempt((current) => current + 1);
  }, []);

  return {
    containerRef,
    token: token ?? undefined,
    reset,
    retry,
    enabled,
    error: failure ? describeTurnstileError(failure, isDev) : null,
    ready: !enabled || Boolean(token),
  };
};

export type TurnstileState = ReturnType<typeof useTurnstile>;
