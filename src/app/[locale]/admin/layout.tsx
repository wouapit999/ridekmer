import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { DemoBanner } from "@/components/layout/demo-banner";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { Link, redirect } from "@/i18n/navigation";
import { requireStaffMfa, requireUser } from "@/server/auth/session";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser("/admin");
  await requireStaffMfa(user, access);
  if (!access.isStaff) redirect({ href: "/account?forbidden=1", locale: await getLocale() });
  const t = await getTranslations("admin.nav");
  const p = access.permissions;
  const items = [
    { key: "dashboard", href: "/admin", show: true },
    { key: "bookings", href: "/admin/bookings", show: p.has("booking.view_all") },
    { key: "vehicles", href: "/admin/vehicles", show: p.has("vehicle.view_all") },
    { key: "documents", href: "/admin/documents", show: p.has("document.verify") },
    {
      key: "verifications",
      href: "/admin/verifications",
      show: p.has("customer.verify") || p.has("owner.verify"),
    },
    { key: "payments", href: "/admin/payments", show: p.has("payment.view") },
    {
      key: "refunds",
      href: "/admin/refunds",
      show: p.has("refund.request") || p.has("refund.approve"),
    },
    { key: "incidents", href: "/admin/incidents", show: p.has("incident.manage") },
    { key: "maintenance", href: "/admin/maintenance", show: p.has("maintenance.manage") },
    { key: "contracts", href: "/admin/contracts", show: p.has("contract.view_all") },
    { key: "users", href: "/admin/users", show: p.has("user.view_all") },
    { key: "settings", href: "/admin/settings", show: p.has("settings.manage") },
    { key: "audit", href: "/admin/audit", show: p.has("audit.view") },
  ] as const;

  return (
    <>
      <DemoBanner />
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-sand-200 bg-white lg:w-64 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between px-4 py-4">
            <Link href="/" aria-label="RideKmer">
              <Logo />
            </Link>
          </div>
          <nav
            aria-label="Administration"
            className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:pb-0"
          >
            {items
              .filter((i) => i.show)
              .map((i) => (
                <Link
                  key={i.key}
                  href={i.href}
                  className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-sand-800 hover:bg-brand-50 hover:text-brand-700"
                >
                  {t(i.key)}
                </Link>
              ))}
          </nav>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-end gap-3 border-b border-sand-200 bg-white px-4 py-2">
            <LanguageSwitcher />
            <UserMenu viewer={{ name: user.name, isStaff: true }} />
          </header>
          <main id="main" className="flex-1 bg-sand-50 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
