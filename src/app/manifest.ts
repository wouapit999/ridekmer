import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RideKmer",
    short_name: "RideKmer",
    description: "Location de voitures, leasing et gestion de flotte au Cameroun",
    id: "/fr",
    start_url: "/fr",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#136843",
    lang: "fr",
    orientation: "portrait",
    categories: ["travel", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
