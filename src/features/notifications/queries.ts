import { db } from "@/server/db";
import { ACTION_EMAIL_CATEGORY } from "@/server/notifications/alerts";

/** In-app notifications are the ones listed under the bell. */
const inbox = (userId: string) => ({ userId, channel: "IN_APP" as const });

export async function countUnreadNotifications(userId: string): Promise<number> {
  return db.notification.count({ where: { ...inbox(userId), readAt: null } });
}

export async function listNotifications(userId: string, take = 50) {
  return db.notification.findMany({
    where: inbox(userId),
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      templateKey: true,
      subject: true,
      body: true,
      entityType: true,
      entityId: true,
      readAt: true,
      createdAt: true,
    },
  });
}

/** Marks one of the user's notifications read and returns it (null when it is not theirs). */
export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await db.notification.findFirst({
    where: { ...inbox(userId), id: notificationId },
    select: { id: true, templateKey: true, entityType: true, entityId: true, readAt: true },
  });
  if (!notification) return null;
  if (!notification.readAt)
    await db.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  return notification;
}

export async function markAllNotificationsRead(userId: string) {
  await db.notification.updateMany({
    where: { ...inbox(userId), readAt: null },
    data: { readAt: new Date() },
  });
}

export async function actionEmailsEnabled(userId: string): Promise<boolean> {
  const pref = await db.notificationPreference.findUnique({
    where: {
      userId_channel_category: { userId, channel: "EMAIL", category: ACTION_EMAIL_CATEGORY },
    },
  });
  return pref?.enabled ?? true;
}

export async function setActionEmails(userId: string, enabled: boolean) {
  await db.notificationPreference.upsert({
    where: {
      userId_channel_category: { userId, channel: "EMAIL", category: ACTION_EMAIL_CATEGORY },
    },
    create: { userId, channel: "EMAIL", category: ACTION_EMAIL_CATEGORY, enabled },
    update: { enabled },
  });
}
