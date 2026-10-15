import { getTranslations } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/container";

export async function LegalPage({
  section,
  values,
}: {
  section: "terms" | "rentalPolicy" | "cancellationPolicy";
  values?: Record<string, string | number>;
}) {
  const t = await getTranslations("legal");
  return (
    <Container className="py-10">
      <PageHeader title={t(`${section}.title`)} />
      <Alert tone="warning" className="mb-6 max-w-3xl">
        {t("placeholderNotice")}
      </Alert>
      <div className="max-w-3xl space-y-4 text-sand-800">
        <p>{t(`${section}.body`, values)}</p>
        <p className="text-sm text-sand-600">{t("lastUpdated", { date: "2026-10-15" })}</p>
      </div>
    </Container>
  );
}
