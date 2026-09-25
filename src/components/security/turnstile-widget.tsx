"use client";

import type { RefObject } from "react";

type TurnstileWidgetProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  loadError?: boolean;
};

const TurnstileWidget = ({
  containerRef,
  enabled,
  loadError = false,
}: TurnstileWidgetProps) => {
  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-1">
      <div ref={containerRef} className="min-h-16.25" />
      {loadError ? (
        <p className="text-xs text-destructive">
          The verification check couldn&apos;t load. Disable content blockers
          for this site and refresh.
        </p>
      ) : null}
    </div>
  );
};

export default TurnstileWidget;
