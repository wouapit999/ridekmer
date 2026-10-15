"use client";

import { useTranslations } from "next-intl";

import { buttonClasses } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

import { useViewer } from "./viewer-provider";

export interface Viewer {
  name: string;
  isStaff: boolean;
}

/**
 * Pass `viewer` when the layout already knows the session (admin, owner); omit it on the
 * public site, where the state comes from `ViewerProvider` so pages can be static.
 */
export function UserMenu({ viewer: explicit }: { viewer?: Viewer | null }) {
  const t = useTranslations("common.nav");
  const router = useRouter();
  const context = useViewer();
  const viewer = explicit === undefined ? context.viewer : explicit;

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
          context.refresh();
          router.push("/");
          router.refresh();
        }}
      >
        {t("logout")}
      </button>
    </div>
  );
}
