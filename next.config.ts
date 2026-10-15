import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { securityHeaders } from "./src/server/security/headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Document and photo uploads go through server actions. Vercel's request limit is ~4.5 MB,
    // so STORAGE_MAX_FILE_SIZE_BYTES must stay below that until direct-to-storage uploads land (M8).
    serverActions: { bodySizeLimit: "12mb" },
  },
  transpilePackages: [
    "@ridekmer/payments",
    "@ridekmer/notifications",
    "@ridekmer/storage",
    "@ridekmer/tracking",
    "@ridekmer/contracts",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(),
      },
    ];
  },
};

export default withNextIntl(nextConfig);
