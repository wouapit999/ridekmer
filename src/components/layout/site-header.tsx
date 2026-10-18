"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { useViewer } from "./viewer-provider";

const NAV: Array<{
  href: string;
  key: "cars" | "howItWorks" | "partner" | "chauffeur" | "corporate" | "longTerm";
}> = [
  { href: "/cars", key: "cars" },
  { href: "/how-it-works", key: "howItWorks" },
  { href: "/partner", key: "partner" },
  { href: "/chauffeur", key: "chauffeur" },
  { href: "/corporate", key: "corporate" },
  { href: "/long-term", key: "longTerm" },
];

export function SiteHeader() {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const { viewer } = useViewer();

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0" aria-label={t("appName")}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100 hover:text-brand-700"
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher />
          <UserMenu />
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          {/* On phones the bell stays visible next to the menu button. */}
          {viewer ? <NotificationBell unread={viewer.unread ?? 0} /> : null}
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-sand-800 hover:bg-sand-100"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t("nav.closeMenu") : t("nav.menu")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open ? (
        <div id="mobile-nav" className="border-t border-sand-200 bg-white lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-base font-medium text-sand-800 hover:bg-sand-100"
              >
                {t(`nav.${item.key}`)}
              </Link>
            ))}
            <Link
              href="/faq"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-base font-medium text-sand-800 hover:bg-sand-100"
            >
              {t("nav.faq")}
            </Link>
            <Link
              href="/contact"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-base font-medium text-sand-800 hover:bg-sand-100"
            >
              {t("nav.contact")}
            </Link>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 px-3 pt-4">
              <LanguageSwitcher />
              <UserMenu showBell={false} />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
