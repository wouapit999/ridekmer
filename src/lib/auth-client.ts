"use client";

import {
  inferAdditionalFields,
  phoneNumberClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "@/server/auth/auth";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    twoFactorClient({
      onTwoFactorRedirect() {
        const locale = window.location.pathname.split("/")[1] || "fr";
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload clears partial auth state
        window.location.href = `/${locale}/mfa`;
      },
    }),
    phoneNumberClient(),
  ],
});
