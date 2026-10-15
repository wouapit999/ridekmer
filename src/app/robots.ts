import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.APP_ENV === "production";
  return {
    rules: isProduction
      ? [{ userAgent: "*", allow: "/", disallow: ["/api/", "/*/admin", "/*/account", "/*/owner"] }]
      : [{ userAgent: "*", disallow: "/" }],
    sitemap: isProduction ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sitemap.xml` : undefined,
  };
}
