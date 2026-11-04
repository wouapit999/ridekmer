import type { Locale } from "@ridekmer/notifications";

import { notificationHref } from "@/features/notifications/links";
import { publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { SUPER_ADMIN_ROLE, type PermissionKey } from "@/server/auth/permissions";
import { db } from "@/server/db";

import { sendTemplatedNotification } from "./index";

/** NotificationPreference category for "something needs your attention" e-mails. */
export const ACTION_EMAIL_CATEGORY = "actions";

interface AlertRecipient {
  id: string;
  email: string;
  name: string;
  preferredLocale: string;
}

interface AlertInput {
  templateKey: string;
  /** Template values, or a function of the reader's language for translated values. */
  variables:
    Record<string, string | number> | ((locale: Locale) => Record<string, string | number>);
  entityType: string;
  entityId: string;
  /** One alert per recipient and key; repeated calls (retries, re-submits) are ignored. */
  dedupeKey: string;
}

const recipientSelect = { id: true, email: true, name: true, preferredLocale: true } as const;

/** Active users holding a permission (super administrators hold them all). */
export async function usersWithPermission(permission: PermissionKey): Promise<AlertRecipient[]> {
  const now = new Date();
  return db.user.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      userRoles: {
        some: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          role: {
            OR: [
              { key: SUPER_ADMIN_ROLE },
              { rolePermissions: { some: { permission: { key: permission } } } },
            ],
          },
        },
      },
    },
    select: recipientSelect,
  });
}

async function wantsActionEmails(userId: string): Promise<boolean> {
  const pref = await db.notificationPreference.findUnique({
    where: {
      userId_channel_category: { userId, channel: "EMAIL", category: ACTION_EMAIL_CATEGORY },
    },
  });
  return pref?.enabled ?? true;
}

/**
 * Tell one person that something needs their attention: an in-app notification (shown under
 * the bell) and, unless they turned action e-mails off, an e-mail with a link to the page
 * where the action is done. Never throws: an alert must not break the action that raised it.
 */
export async function alertUser(recipient: AlertRecipient | string, input: AlertInput) {
  try {
    const user =
      typeof recipient === "string"
        ? await db.user.findFirst({
            where: { id: recipient, status: "ACTIVE", deletedAt: null },
            select: recipientSelect,
          })
        : recipient;
    if (!user) return;
    // Checked before sending: a dedupe key only stops the row, not the e-mail itself.
    const inAppKey = `${input.dedupeKey}:${user.id}:in-app`;
    if (await db.notification.findUnique({ where: { dedupeKey: inAppKey }, select: { id: true } }))
      return;
    const locale: Locale = user.preferredLocale === "en" ? "en" : "fr";
    const href = notificationHref(input);
    const values =
      typeof input.variables === "function" ? input.variables(locale) : input.variables;
    const variables = {
      ...values,
      name: values.name ?? user.name,
      url: href ? `${publicEnv.appUrl}/${locale}${href}` : publicEnv.appUrl,
    };
    const base = {
      templateKey: input.templateKey,
      locale,
      userId: user.id,
      variables,
      entityType: input.entityType,
      entityId: input.entityId,
    };
    await sendTemplatedNotification({
      ...base,
      channel: "IN_APP",
      to: user.email,
      dedupeKey: inAppKey,
    });
    if (await wantsActionEmails(user.id))
      await sendTemplatedNotification({
        ...base,
        channel: "EMAIL",
        to: user.email,
        dedupeKey: `${input.dedupeKey}:${user.id}:email`,
        mirrorInApp: false,
      });
  } catch (error) {
    logger.warn("notification.alert_failed", { templateKey: input.templateKey, error });
  }
}

/** Alert every staff member who can act on it (holders of `permission`), except the actor. */
export async function alertStaff(
  permission: PermissionKey,
  input: AlertInput & { exceptUserId?: string | null },
) {
  try {
    const staff = await usersWithPermission(permission);
    for (const user of staff) {
      if (user.id === input.exceptUserId) continue;
      await alertUser(user, input);
    }
  } catch (error) {
    logger.warn("notification.staff_alert_failed", { templateKey: input.templateKey, error });
  }
}
