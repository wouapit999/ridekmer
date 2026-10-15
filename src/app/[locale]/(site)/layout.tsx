import type { ReactNode } from "react";

import { DemoBanner } from "@/components/layout/demo-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ViewerProvider } from "@/components/layout/viewer-provider";
import { ServiceWorkerManager } from "@/components/pwa/service-worker-manager";

/**
 * The public site layout reads no request data (ADR-033): the signed-in state is fetched on
 * the client, so marketing and legal pages are rendered statically and served from the CDN.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <ViewerProvider>
      <DemoBanner />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <ServiceWorkerManager />
    </ViewerProvider>
  );
}
