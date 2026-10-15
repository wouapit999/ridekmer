import type { ReactNode } from "react";

import { DemoBanner } from "@/components/layout/demo-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentSession } from "@/server/auth/session";
import { getAccessProfile } from "@/server/auth/rbac";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const current = await getCurrentSession();
  const access = current ? await getAccessProfile(current.user.id) : null;
  const viewer = current ? { name: current.user.name, isStaff: Boolean(access?.isStaff) } : null;
  return (
    <>
      <DemoBanner />
      <SiteHeader viewer={viewer} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
