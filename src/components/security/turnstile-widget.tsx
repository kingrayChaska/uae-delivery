"use client";

import type { TurnstileState } from "@/lib/hooks/use-turnstile";

type TurnstileWidgetProps = {
  turnstile: TurnstileState;
};

const TurnstileWidget = ({ turnstile }: TurnstileWidgetProps) => {
  const { containerRef, enabled, error, ready, retry } = turnstile;
  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Turnstile renders its checkbox iframe into this box; the min
          height stops the form jumping when it appears. */}
      <div ref={containerRef} className="min-h-16.25" />
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-1 text-xs text-destructive">
          <p>{error}</p>
          <button type="button" onClick={retry} className="font-medium underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : !ready ? (
        <p className="text-xs text-muted-foreground">Complete the check above to continue.</p>
      ) : null}
    </div>
  );
};

export default TurnstileWidget;
