import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import {
  markAllNotificationsReadAction,
  setActionEmailsAction,
} from "@/features/notifications/actions";
import { notificationHref } from "@/features/notifications/links";
import { actionEmailsEnabled, listNotifications } from "@/features/notifications/queries";
import { cn } from "@/lib/cn";
import { requireUser } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "notifications" });
  return { title: t("title") };
}

export default async function NotificationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser("/account/notifications");
  const t = await getTranslations("notifications");
  const format = await getFormatter();
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const [items, emails] = await Promise.all([
    listNotifications(user.id),
    actionEmailsEnabled(user.id),
  ]);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro")} />
      <AccountNav current="notifications" />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sand-700">{t("unreadCount", { count: unread })}</p>
        {unread > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" size="sm">
              {t("markAllRead")}
            </Button>
          </form>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-sand-200 bg-white p-6 text-sm text-sand-600">
          {t("empty")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-sand-200 overflow-hidden rounded-xl border border-sand-200 bg-white">
          {items.map((n) => {
            const href = notificationHref(n);
            return (
              <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.readAt && "bg-brand-50")}>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                    n.readAt ? "bg-transparent" : "bg-brand-600",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm text-sand-900", !n.readAt && "font-semibold")}>
                    {n.subject ?? t("untitled")}
                    {!n.readAt ? <span className="sr-only"> ({t("new")})</span> : null}
                  </p>
                  <p className="text-sm break-words text-sand-700">{n.body}</p>
                  <p className="mt-1 text-xs text-sand-500">
                    {format.dateTime(n.createdAt, "full")}
                  </p>
                </div>
                {/* Opening goes through the API so the notification is marked read first. */}
                {href || !n.readAt ? (
                  <a
                    href={`/api/account/notifications/${n.id}/open?locale=${currentLocale}`}
                    className="shrink-0 self-center text-sm font-medium text-brand-700 hover:underline"
                  >
                    {href ? t("open") : t("markRead")}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <section className="mt-8 max-w-2xl space-y-2 rounded-xl border border-sand-200 bg-white p-5">
        <h2 className="font-semibold text-sand-900">{t("emailTitle")}</h2>
        <p className="text-sm text-sand-700">{emails ? t("emailOn") : t("emailOff")}</p>
        <form action={setActionEmailsAction}>
          <input type="hidden" name="enabled" value={emails ? "false" : "true"} />
          <Button type="submit" variant="outline" size="sm">
            {emails ? t("emailDisable") : t("emailEnable")}
          </Button>
        </form>
      </section>
    </Container>
  );
}
