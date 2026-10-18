import { NextResponse, type NextRequest } from "next/server";

import { notificationHref } from "@/features/notifications/links";
import { markNotificationRead } from "@/features/notifications/queries";
import { getCurrentSession } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opening a notification marks it read, then goes to the page where the action is done. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = request.nextUrl.searchParams.get("locale") === "en" ? "en" : "fr";
  const current = await getCurrentSession();
  if (!current) return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  const notification = await markNotificationRead(current.user.id, id);
  const href = notification ? notificationHref(notification) : null;
  return NextResponse.redirect(
    new URL(`/${locale}${href ?? "/account/notifications"}`, request.url),
  );
}
