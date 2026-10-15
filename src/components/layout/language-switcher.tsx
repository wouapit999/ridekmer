"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type AppLocale } from "@/i18n/routing";

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: AppLocale) {
    const query = searchParams.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { locale: next });
  }

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={t("language")}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => change(l)}
          aria-pressed={l === locale}
          lang={l}
          className={
            l === locale
              ? "rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white"
              : "rounded-md px-2.5 py-1 text-xs font-semibold text-sand-700 hover:bg-sand-100"
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
