import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";

const PUBLIC_PATHS = [
  "",
  "/cars",
  "/how-it-works",
  "/partner",
  "/chauffeur",
  "/corporate",
  "/long-term",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/rental-policy",
  "/cancellation-policy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return routing.locales.flatMap((locale) =>
    PUBLIC_PATHS.map((path) => ({
      url: `${base}/${locale}${path}`,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.6,
    })),
  );
}
