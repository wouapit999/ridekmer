import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { countSampleVehicles } from "@/features/admin/sample-cars";
import { SampleCarsControls } from "@/features/admin/sample-cars-forms";
import { SHOWCASE_VEHICLES } from "@/features/vehicles/showcase-data";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.samples" });
  return { title: t("title") };
}

export default async function SampleCarsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("settings.manage", "/admin/samples");
  const t = await getTranslations("admin.samples");
  const count = await countSampleVehicles();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-sand-700">{t("intro")}</p>
      </div>
      <Alert tone={count > 0 ? "warning" : "info"}>
        {count > 0 ? t("statusOnline", { count }) : t("statusNone")}
      </Alert>
      <SampleCarsControls count={count} />
      <section className="rounded-lg border border-sand-200 bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold text-sand-900">{t("listTitle")}</h2>
        <ul className="mt-3 grid gap-2 text-sm text-sand-800 sm:grid-cols-2">
          {SHOWCASE_VEHICLES.map((v) => (
            <li key={v.plate} className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- small static thumbnail */}
              <img src={`/showcase/${v.photo}`} alt="" className="h-10 w-16 rounded object-cover" />
              <span>
                {v.make} {v.model} {v.year} · <span className="font-mono text-xs">{v.plate}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-sand-600">
          {t("rules")}{" "}
          <Link href="/cars" className="underline">
            {t("seeCatalogue")}
          </Link>
        </p>
      </section>
    </div>
  );
}
