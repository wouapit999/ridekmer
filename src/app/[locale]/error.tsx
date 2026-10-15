"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const tActions = useTranslations("common.actions");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="py-24 text-center">
      <h1 className="text-3xl font-bold text-sand-900">{t("genericTitle")}</h1>
      <p className="mt-3 text-sand-700">{t("genericBody")}</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-sand-500">{error.digest}</p> : null}
      <div className="mt-8">
        <Button onClick={() => reset()}>{tActions("retry")}</Button>
      </div>
    </Container>
  );
}
