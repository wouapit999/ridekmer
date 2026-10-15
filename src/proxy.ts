import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "./i18n/routing";

const handleI18nRouting = createIntlMiddleware(routing);

/**
 * Next.js 16 proxy (formerly middleware). Only locale negotiation lives here; authentication
 * and authorisation are enforced server-side in pages, actions and route handlers.
 */
export default function proxy(request: NextRequest) {
  return handleI18nRouting(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|manifest\\.webmanifest|sw\\.js|icons|.*\\..*).*)"],
};
