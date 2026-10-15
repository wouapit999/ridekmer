import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/container";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "owner" });
  return { title: t("metaTitle") };
}

export default async function OwnerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser("/owner");
  if (!access.roles.some((r) => r.key === "vehicle_owner"))
    redirect({ href: "/account", locale: await getLocale() });
  const profile = await db.ownerProfile.findUnique({
    where: { userId: user.id },
    include: { vehicles: { select: { id: true } } },
  });
  const t = await getTranslations("owner");
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={profile?.displayName} />
      <Alert tone="info">{t("intro")}</Alert>
      <p className="mt-4 text-sm text-sand-600">Vehicles: {profile?.vehicles.length ?? 0}</p>
    </Container>
  );
}
