"use client";

import { useTranslations } from "next-intl";

import { buttonClasses } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

import { NotificationBell } from "./notification-bell";
import { useViewer } from "./viewer-provider";

export interface Viewer {
  name: string;
  isStaff: boolean;
  /** Unread in-app notifications, shown on the bell. */
  unread?: number;
}

/**
 * Pass `viewer` when the layout already knows the session (admin, owner); omit it on the
 * public site, where the state comes from `ViewerProvider` so pages can be static.
 */
export function UserMenu({
  viewer: explicit,
  showBell = true,
}: {
  viewer?: Viewer | null;
  /** The mobile menu leaves the bell out: it already sits next to the menu button. */
  showBell?: boolean;
}) {
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
      {showBell ? <NotificationBell unread={viewer.unread ?? 0} /> : null}
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
