import { useTranslations } from "next-intl";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <Container className="py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-bold text-sand-900">{t("notFoundTitle")}</h1>
      <p className="mt-3 text-sand-700">{t("notFoundBody")}</p>
      <div className="mt-8">
        <ButtonLink href="/">{t("goHome")}</ButtonLink>
      </div>
    </Container>
  );
}
