import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Container className="py-10">
      <div className="mx-auto max-w-md rounded-xl border border-sand-200 bg-white p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-bold text-sand-900">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-sand-700">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </Container>
  );
}
