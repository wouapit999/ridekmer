"use client";

import { useTranslations } from "next-intl";

import { buttonClasses } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export interface Viewer {
  name: string;
  isStaff: boolean;
}

export function UserMenu({ viewer }: { viewer: Viewer | null }) {
  const t = useTranslations("common.nav");
  const router = useRouter();

  if (!viewer) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className={buttonClasses("ghost", "sm")}>
          {t("login")}
        </Link>
        <Link href="/register" className={buttonClasses("primary", "sm")}>
          {t("register")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/account" className={buttonClasses("outline", "sm")}>
        {t("account")}
      </Link>
      {viewer.isStaff ? (
        <Link href="/admin" className={buttonClasses("ghost", "sm")}>
          {t("admin")}
        </Link>
      ) : null}
      <button
        type="button"
        className={buttonClasses("ghost", "sm")}
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        {t("logout")}
      </button>
    </div>
  );
}
