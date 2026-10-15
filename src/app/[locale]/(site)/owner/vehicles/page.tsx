import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { requireOwnerPage } from "@/features/owner/guards";
import { OwnerNav } from "@/features/owner/owner-nav";
import { listOwnerVehicles } from "@/features/vehicles/service";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";

const TONE: Record<string, "neutral" | "brand" | "warn" | "danger" | "good"> = {
  DRAFT: "neutral",
  SUBMITTED: "brand",
  UNDER_REVIEW: "brand",
  APPROVED: "good",
  ACTIVE: "good",
  SUSPENDED: "warn",
  UNAVAILABLE_DOCUMENTS: "danger",
  WITHDRAWN: "neutral",
  REJECTED: "danger",
};

export default async function OwnerVehiclesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireOwnerPage("/owner/vehicles");
  const t = await getTranslations("owner");
  const currentLocale = await getLocale();
  const vehicles = await listOwnerVehicles(user.id);
  return (
    <Container className="py-10">
      <PageHeader title={t("vehicles.title")} />
      <OwnerNav current="vehicles" />
      <div className="mt-6 space-y-4">
        <ButtonLink href="/owner/vehicles/new">{t("vehicles.add")}</ButtonLink>
        {vehicles.length === 0 ? <p className="text-sand-600">{t("vehicles.empty")}</p> : null}
        <ul className="grid gap-4 sm:grid-cols-2">
          {vehicles.map((v) => (
            <li key={v.id} className="rounded-xl border border-sand-200 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  {v.make} {v.model}{" "}
                  <span className="font-normal text-sand-500">{v.registrationNumber}</span>
                </h2>
                <Badge tone={TONE[v.status]}>{t(`vehicles.status.${v.status}`)}</Badge>
              </div>
              <p className="mt-1 text-sm text-sand-600">
                {currentLocale === "en" ? v.city.nameEn : v.city.nameFr} ·{" "}
                {v.dailyPriceXaf > 0 ? formatXaf(v.dailyPriceXaf, currentLocale) : "—"}
              </p>
              <p
                className={`mt-1 text-xs ${v.documentsValid ? "text-success-600" : "text-accent-700"}`}
              >
                {v.documentsValid ? t("vehicles.documentsValid") : t("vehicles.documentsInvalid")}
              </p>
              <div className="mt-3 flex gap-3 text-sm">
                {["DRAFT", "REJECTED"].includes(v.status) ? (
                  <Link
                    href={`/owner/vehicles/${v.id}/edit`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t("vehicles.continueOnboarding")}
                  </Link>
                ) : null}
                <Link
                  href={`/owner/vehicles/${v.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {t("vehicles.view")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
