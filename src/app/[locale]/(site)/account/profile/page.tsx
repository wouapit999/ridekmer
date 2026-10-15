import { getTranslations, setRequestLocale } from "next-intl/server";

import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { ProfileForm } from "@/features/account/profile-form";
import { requireUser } from "@/server/auth/session";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser("/account/profile");
  const t = await getTranslations("account");
  return (
    <Container className="py-10">
      <PageHeader title={t("profile.title")} />
      <AccountNav current="profile" />
      <div className="mt-6">
        <ProfileForm user={user} />
      </div>
    </Container>
  );
}
