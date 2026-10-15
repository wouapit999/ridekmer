import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { Logo } from "./logo";

export function SiteFooter() {
  const t = useTranslations("common");
  const year = new Date().getFullYear();
  const col = "space-y-2 text-sm";
  const link = "text-sand-700 hover:text-brand-700";
  return (
    <footer className="mt-16 border-t border-sand-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-sand-700">{t("footer.description")}</p>
          <p className="mt-3 text-sm font-medium text-sand-800">{t("footer.cities")}</p>
        </div>
        <div className={col}>
          <h2 className="font-semibold text-sand-900">{t("footer.rent")}</h2>
          <Link className={link} href="/cars">
            {t("nav.cars")}
          </Link>
          <br />
          <Link className={link} href="/chauffeur">
            {t("nav.chauffeur")}
          </Link>
          <br />
          <Link className={link} href="/long-term">
            {t("nav.longTerm")}
          </Link>
          <br />
          <Link className={link} href="/corporate">
            {t("nav.corporate")}
          </Link>
        </div>
        <div className={col}>
          <h2 className="font-semibold text-sand-900">{t("footer.partners")}</h2>
          <Link className={link} href="/partner">
            {t("nav.partner")}
          </Link>
          <br />
          <Link className={link} href="/how-it-works">
            {t("nav.howItWorks")}
          </Link>
          <br />
          <Link className={link} href="/faq">
            {t("nav.faq")}
          </Link>
          <br />
          <Link className={link} href="/contact">
            {t("footer.support")}
          </Link>
        </div>
        <div className={col}>
          <h2 className="font-semibold text-sand-900">{t("footer.legal")}</h2>
          <Link className={link} href="/privacy">
            {t("footer.privacy")}
          </Link>
          <br />
          <Link className={link} href="/terms">
            {t("footer.terms")}
          </Link>
          <br />
          <Link className={link} href="/rental-policy">
            {t("footer.rentalPolicy")}
          </Link>
          <br />
          <Link className={link} href="/cancellation-policy">
            {t("footer.cancellationPolicy")}
          </Link>
        </div>
      </div>
      <div className="border-t border-sand-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-sand-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{t("footer.rights", { year })}</p>
          <p>{t("currencyNote")}</p>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-4 text-xs text-sand-500 sm:px-6 lg:px-8">
          {t("footer.legalNotice")}
        </p>
      </div>
    </footer>
  );
}
