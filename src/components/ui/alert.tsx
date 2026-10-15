import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  info: "border-info-600/30 bg-info-50 text-info-600",
  success: "border-success-600/30 bg-success-50 text-success-600",
  warning: "border-accent-500/40 bg-accent-50 text-accent-700",
  danger: "border-danger-500/40 bg-danger-50 text-danger-700",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-sm", tones[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warn" | "danger" | "good";
}) {
  const map = {
    neutral: "bg-sand-100 text-sand-700",
    brand: "bg-brand-50 text-brand-700",
    warn: "bg-accent-50 text-accent-700",
    danger: "bg-danger-50 text-danger-700",
    good: "bg-success-50 text-success-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        map[tone],
      )}
    >
      {children}
    </span>
  );
}
