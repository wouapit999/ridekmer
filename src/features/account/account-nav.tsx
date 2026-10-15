import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function AccountNav({
  current,
}: {
  current: "overview" | "profile" | "security" | "documents";
}) {
  const t = useTranslations("account.nav");
  const items = [
    { key: "overview", href: "/account" },
    { key: "profile", href: "/account/profile" },
    { key: "security", href: "/account/security" },
    { key: "documents", href: "/account/documents" },
  ] as const;
  return (
    <nav aria-label="Account" className="flex gap-1 overflow-x-auto border-b border-sand-200 pb-px">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? "page" : undefined}
          className={
            current === item.key
              ? "-mb-px border-b-2 border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700"
              : "px-3 py-2 text-sm font-medium text-sand-700 hover:text-brand-700"
          }
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}
