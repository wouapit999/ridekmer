import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";

import { getEnv } from "@/lib/env";
import { redirect } from "@/i18n/navigation";

import { auth } from "./auth";
import type { PermissionKey } from "./permissions";
import { assertPermission, getAccessProfile, type AccessProfile } from "./rbac";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  twoFactorEnabled: boolean;
  preferredLocale: "fr" | "en";
  status: string;
}

export const getCurrentSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    phoneNumber?: string | null;
    twoFactorEnabled?: boolean | null;
    preferredLocale?: string;
    status?: string;
  };
  const user: CurrentUser = {
    id: u.id,
    name: u.name,
    email: u.email,
    phoneNumber: u.phoneNumber ?? null,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    preferredLocale: u.preferredLocale === "en" ? "en" : "fr",
    status: u.status ?? "ACTIVE",
  };
  return { session: session.session, user };
});

/** Redirects to the login page (preserving the locale) when no session exists. */
export async function requireUser(
  returnTo?: string,
): Promise<{ user: CurrentUser; access: AccessProfile }> {
  const current = await getCurrentSession();
  const locale = await getLocale();
  if (!current) {
    const target = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
    redirect({ href: target, locale });
  }
  const access = await getAccessProfile(current!.user.id);
  return { user: current!.user, access };
}

/**
 * Staff members whose role requires MFA must have TOTP enabled before using staff areas.
 * Enforcement can be disabled in development through AUTH_REQUIRE_STAFF_MFA=false.
 */
export async function requireStaffMfa(user: CurrentUser, access: AccessProfile): Promise<void> {
  if (!access.requiresMfa) return;
  if (!getEnv().AUTH_REQUIRE_STAFF_MFA) return;
  if (!user.twoFactorEnabled) {
    const locale = await getLocale();
    redirect({ href: "/account/security?mfa=required", locale });
  }
}

/** Page-level guard: requires a user with the permission (and MFA for staff). */
export async function requirePermission(permission: PermissionKey, returnTo?: string) {
  const { user, access } = await requireUser(returnTo);
  await requireStaffMfa(user, access);
  if (!access.permissions.has(permission)) {
    const locale = await getLocale();
    redirect({ href: "/account?forbidden=1", locale });
  }
  return { user, access };
}

/** Action/route-level guard: throws instead of redirecting. */
export async function requirePermissionOrThrow(permission: PermissionKey) {
  const current = await getCurrentSession();
  if (!current) {
    const { UnauthorizedError } = await import("./rbac");
    throw new UnauthorizedError();
  }
  const access = await assertPermission(current.user.id, permission);
  if (access.requiresMfa && getEnv().AUTH_REQUIRE_STAFF_MFA && !current.user.twoFactorEnabled) {
    const { ForbiddenError } = await import("./rbac");
    throw new ForbiddenError("MFA required");
  }
  return { user: current.user, access };
}
