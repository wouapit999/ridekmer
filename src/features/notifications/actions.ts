"use server";

import { revalidatePath } from "next/cache";

import { getCurrentSession } from "@/server/auth/session";

import { markAllNotificationsRead, setActionEmails } from "./queries";

export async function markAllNotificationsReadAction(): Promise<void> {
  const current = await getCurrentSession();
  if (!current) return;
  await markAllNotificationsRead(current.user.id);
  revalidatePath("/[locale]/account/notifications", "page");
}

export async function setActionEmailsAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) return;
  await setActionEmails(current.user.id, formData.get("enabled") === "true");
  revalidatePath("/[locale]/account/notifications", "page");
}
