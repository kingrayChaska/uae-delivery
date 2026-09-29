"use client";

import { useTranslations } from "next-intl";

import { useMessage } from "@/i18n/hooks";

import type { TurnstileState } from "@/lib/hooks/use-turnstile";

type TurnstileWidgetProps = {
  turnstile: TurnstileState;
};

const TurnstileWidget = ({ turnstile }: TurnstileWidgetProps) => {
  const { containerRef, enabled, error, ready, retry } = turnstile;
  const t = useTranslations("common");
  const translate = useMessage();
  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Turnstile renders its checkbox iframe into this box; the min
          height stops the form jumping when it appears. */}
      <div ref={containerRef} className="min-h-16.25" />
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-1 text-xs text-destructive">
          <p>{translate(error)}</p>
          <button type="button" onClick={retry} className="font-medium underline underline-offset-2">
            {t("actions.retry")}
          </button>
        </div>
      ) : !ready ? (
        <p className="text-xs text-muted-foreground">{t("verification.complete")}</p>
      ) : null}
    </div>
  );
};

export default TurnstileWidget;
