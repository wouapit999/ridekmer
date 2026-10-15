import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/session";

import { getOwnerProfile } from "./service";

/** Page guard: signed-in user with the vehicle_owner role and an owner profile. */
export async function requireOwnerPage(returnTo: string) {
  const { user, access } = await requireUser(returnTo);
  const isOwner = access.roles.some((r) => r.key === "vehicle_owner");
  const profile = isOwner ? await getOwnerProfile(user.id) : null;
  if (!profile) redirect({ href: "/account", locale: await getLocale() });
  return { user, access, profile: profile! };
}
