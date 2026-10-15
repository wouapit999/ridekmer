import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { BookingError, getBookingForCustomer } from "@/features/bookings/service";
import { ReportIncidentForm } from "@/features/incidents/forms";
import { requireUser } from "@/server/auth/session";

export default async function NewIncidentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser(`/account/bookings/${id}/incidents/new`);
  let booking: Awaited<ReturnType<typeof getBookingForCustomer>>;
  try {
    booking = await getBookingForCustomer(id, user.id);
  } catch (error) {
    if (error instanceof BookingError) notFound();
    throw error;
  }
  const t = await getTranslations("incidents");
  const allowed = ["ACTIVE", "EXTENSION_REQUESTED", "COMPLETED", "DISPUTED"].includes(
    booking.status,
  );
  return (
    <Container className="py-10">
      <PageHeader
        title={t("reportTitle", { reference: booking.reference })}
        intro={t("reportIntro")}
      />
      <AccountNav current="bookings" />
      <div className="mt-6 max-w-2xl space-y-4">
        <ButtonLink href={`/account/bookings/${booking.id}`} variant="ghost" size="sm">
          ← {t("backToBooking")}
        </ButtonLink>
        <Alert tone="warning" title={t("emergencyTitle")}>
          {t("emergencyBody")}
        </Alert>
        {allowed ? (
          <ReportIncidentForm
            bookingId={booking.id}
            redirectTo={`/account/bookings/${booking.id}`}
          />
        ) : (
          <Alert tone="info">{t("notAllowed")}</Alert>
        )}
      </div>
    </Container>
  );
}
