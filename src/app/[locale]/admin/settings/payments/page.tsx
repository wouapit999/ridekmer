import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { ProviderConfigCard, TypedSettingField } from "@/features/payments/config-forms";
import { getProviderConfigViews } from "@/features/payments/provider-config";
import { Link } from "@/i18n/navigation";
import { getEnv } from "@/lib/env";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";

const SETTING_KEYS = [
  "payment.bank_transfer_enabled",
  "payment.cash_enabled",
  "payment.bank_transfer_instructions_fr",
  "payment.bank_transfer_instructions_en",
  "payment.mobile_money_expiry_minutes",
  "payment.bank_transfer_expiry_hours",
  "payment.manual_mobile_money_enabled",
  "payment.manual_mtn_momo_number",
  "payment.manual_orange_money_number",
  "payment.manual_mobile_money_account_name",
  "payment.manual_whatsapp_number",
  "payment.manual_mobile_money_expiry_hours",
  "finance.dual_approval_threshold_xaf",
  "booking.payment_timeout_minutes",
];

export default async function AdminPaymentSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("settings.manage", "/admin/settings/payments");
  const t = await getTranslations("admin.settings.payments");
  const currentLocale = await getLocale();
  const format = await getFormatter();
  const env = getEnv();
  const productionApp = env.NODE_ENV === "production" && env.APP_ENV === "production";
  const [settings, views] = await Promise.all([
    db.systemSetting.findMany({ where: { key: { in: SETTING_KEYS } } }),
    getProviderConfigViews(),
  ]);
  const ordered = SETTING_KEYS.map((k) => settings.find((s) => s.key === k)).filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );
  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/settings" className="text-sm text-brand-700 hover:underline">
          ← {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-sand-900">{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-sand-700">{t("intro")}</p>
      </div>
      <Alert tone="info" title={t("securityTitle")}>
        {t("securityBody")}
      </Alert>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("rules")}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {ordered.map((s) => (
            <TypedSettingField
              key={s.key}
              settingKey={s.key}
              value={s.value}
              valueType={s.valueType}
              label={s.key}
              description={(currentLocale === "en" ? s.descriptionEn : s.descriptionFr) ?? ""}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("providersTitle")}</h2>
        <p className="text-sm text-sand-700">{t("providersIntro")}</p>
        {views.map((v) => (
          <ProviderConfigCard
            key={v.key}
            view={{
              ...v,
              lastValidatedAt: v.lastValidatedAt
                ? format.dateTime(v.lastValidatedAt, "full")
                : null,
              updatedAt: v.updatedAt ? format.dateTime(v.updatedAt, "full") : null,
              productionApp,
            }}
          />
        ))}
      </section>
    </div>
  );
}
