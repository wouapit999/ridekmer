import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Container, PageHeader } from "@/components/ui/container";
import { requireOwnerPage } from "@/features/owner/guards";
import { OwnerNav } from "@/features/owner/owner-nav";
import { BasicsForm } from "@/features/vehicles/wizard-forms";
import { db } from "@/server/db";

export default async function NewVehiclePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireOwnerPage("/owner/vehicles/new");
  const t = await getTranslations("owner.wizard");
  const currentLocale = await getLocale();
  const cities = await db.city.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("step", { current: 1, total: 8 })} />
      <OwnerNav current="vehicles" />
      <div className="mt-6 max-w-3xl">
        <BasicsForm
          vehicle={null}
          cities={cities.map((c) => ({
            id: c.id,
            name: currentLocale === "en" ? c.nameEn : c.nameFr,
          }))}
        />
      </div>
    </Container>
  );
}
