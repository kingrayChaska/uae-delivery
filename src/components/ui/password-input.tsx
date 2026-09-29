"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

import Input from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { ComponentProps } from "react";

// A password field with a show/hide toggle. Takes every <input> prop
// (including react-hook-form's register() ref), except `type`, which the
// toggle controls.
const PasswordInput = ({
  className = "",
  ...props
}: Omit<ComponentProps<"input">, "type">) => {
  const t = useTranslations("common.password");
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pe-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? t("hide") : t("show")}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? t("hide") : t("show")}
        disabled={props.disabled}
        className="absolute inset-y-0 end-0 z-10 flex w-10 items-center justify-center rounded-e-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default PasswordInput;
