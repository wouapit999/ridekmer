"use client";

import { useTranslations } from "next-intl";

import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Bell linking to the notifications page, with the number of unread notifications. */
export function NotificationBell({ unread }: { unread: number }) {
  const t = useTranslations("notifications");
  const label = unread > 0 ? t("bellUnread", { count: unread }) : t("bell");
  return (
    <Link
      href="/account/notifications"
      aria-label={label}
      title={label}
      className={buttonClasses("ghost", "sm", "relative px-2.5")}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-500 px-1 text-[11px] leading-none font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
