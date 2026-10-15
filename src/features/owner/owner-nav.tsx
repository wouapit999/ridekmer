import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function OwnerNav({
  current,
}: {
  current: "overview" | "onboarding" | "vehicles" | "finance";
}) {
  const t = useTranslations("owner.nav");
  const items = [
    { key: "overview", href: "/owner" },
    { key: "onboarding", href: "/owner/onboarding" },
    { key: "vehicles", href: "/owner/vehicles" },
    { key: "finance", href: "/owner/finance" },
  ] as const;
  return (
    <nav aria-label="Owner" className="flex gap-1 overflow-x-auto border-b border-sand-200 pb-px">
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
