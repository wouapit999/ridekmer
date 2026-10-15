import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-sand-200 bg-white p-5 shadow-card sm:p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-lg font-semibold text-sand-900", className)}>{children}</h2>;
}

export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "warn" | "good";
}) {
  const tones = { default: "text-sand-900", warn: "text-accent-700", good: "text-success-600" };
  return (
    <div className="rounded-lg border border-sand-200 bg-white p-4 shadow-card">
      <dt className="text-xs font-medium tracking-wide text-sand-600 uppercase">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-bold tabular-nums", tones[tone])}>{value}</dd>
    </div>
  );
}
