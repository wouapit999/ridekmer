import { useTranslations } from "next-intl";

/** Shown outside production so nobody mistakes the mock providers and synthetic data for live. */
export function DemoBanner() {
  const t = useTranslations("common");
  if (process.env.APP_ENV === "production") return null;
  return (
    <p
      className="bg-accent-100 px-4 py-1.5 text-center text-xs font-medium text-accent-700"
      role="note"
    >
      {t("demoBanner")}
    </p>
  );
}
