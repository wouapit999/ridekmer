import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { MarkdownLite } from "@/components/ui/markdown-lite";
import { AccountNav } from "@/features/account/account-nav";
import { BookingError, getBookingForCustomer } from "@/features/bookings/service";
import { AcceptContractForm } from "@/features/contracts/forms";
import {
  ContractError,
  ensureRentalContract,
  listContractsForBooking,
} from "@/features/contracts/service";
import { requireUser } from "@/server/auth/session";

export default async function CustomerContractPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser(`/account/bookings/${id}/contract`);
  try {
    await getBookingForCustomer(id, user.id);
  } catch (error) {
    if (error instanceof BookingError) notFound();
    throw error;
  }
  const t = await getTranslations("contracts");
  const format = await getFormatter();
  let contracts = await listContractsForBooking(id);
  const booking = await getBookingForCustomer(id, user.id);
  if (
    !contracts.some(
      (c) =>
        c.type === "CUSTOMER_RENTAL_AGREEMENT" && c.status !== "SUPERSEDED" && c.status !== "VOID",
    ) &&
    ["CONFIRMED", "READY_FOR_PICKUP"].includes(booking.status)
  ) {
    try {
      await ensureRentalContract(id, user.preferredLocale);
      contracts = await listContractsForBooking(id);
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
    }
  }
  const current = contracts.find(
    (c) =>
      c.type === "CUSTOMER_RENTAL_AGREEMENT" &&
      ["SENT", "GENERATED", "ACCEPTED"].includes(c.status),
  );
  return (
    <Container className="py-10">
      <PageHeader title={t("title", { reference: booking.reference })} />
      <AccountNav current="bookings" />
      <div className="mt-6 space-y-4">
        <ButtonLink href={`/account/bookings/${booking.id}`} variant="ghost" size="sm">
          ← {t("backToBooking")}
        </ButtonLink>
        {!current ? (
          <Alert tone="info">{t("notAvailable")}</Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm text-sand-600">
              <Badge tone={current.status === "ACCEPTED" ? "good" : "warn"}>
                {t(`statuses.${current.status}`)}
              </Badge>
              <span>
                {t("version", { version: current.templateVersion.version })} · {t("checksum")}:{" "}
                <code className="font-mono text-xs">{current.checksumSha256.slice(0, 16)}…</code>
              </span>
              {current.acceptedAt ? (
                <span>
                  {t("acceptedOn", { date: format.dateTime(current.acceptedAt, "full") })}
                </span>
              ) : null}
            </div>
            <article className="rounded-xl border border-sand-200 bg-white p-6">
              <MarkdownLite source={current.renderedMarkdown} />
            </article>
            {current.status === "ACCEPTED" ? (
              <Alert tone="success">{t("alreadyAccepted")}</Alert>
            ) : (
              <AcceptContractForm contractId={current.id} />
            )}
          </>
        )}
      </div>
    </Container>
  );
}
