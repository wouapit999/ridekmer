import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";

export async function BenefitsPage({
  namespace,
  ctaHref,
}: {
  namespace: "chauffeur" | "corporate" | "longTerm";
  ctaHref: string;
}) {
  const t = await getTranslations(namespace);
  const benefits = t.raw("benefits") as string[];
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro")} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {benefits.map((b) => (
          <li
            key={b}
            className="flex items-start gap-3 rounded-lg border border-sand-200 bg-white p-4"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <span className="text-sand-800">{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-10">
        <ButtonLink href={ctaHref} size="lg">
          {t("cta")}
        </ButtonLink>
      </div>
    </Container>
  );
}
