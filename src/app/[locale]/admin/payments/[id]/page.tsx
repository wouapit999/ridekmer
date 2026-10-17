import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import {
  CompleteManualRefundForm,
  ConfirmManualPaymentForm,
  RefreshPaymentForm,
  RefundDecisionForm,
  RefundRequestForm,
} from "@/features/payments/admin-forms";
import {
  PaymentMethodLabel,
  PaymentStatusBadge,
  RefundStatusBadge,
} from "@/features/payments/payment-badge";
import { getPaymentForAdmin, listApprovalsForRefunds } from "@/features/payments/queries";
import { refundableAmount } from "@/features/payments/refunds";
import { OPEN_PAYMENT_STATUSES } from "@/features/payments/service";
import { Link } from "@/i18n/navigation";
import { enumLabel } from "@/lib/i18n-enum";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function AdminPaymentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, access } = await requirePermission("payment.view", `/admin/payments/${id}`);
  const payment = await getPaymentForAdmin(id);
  if (!payment) notFound();
  const t = await getTranslations("payments.admin");
  const te = await getTranslations("enums");
  const tpay = await getTranslations("payments");
  const tenv = await getTranslations("admin.settings.payments");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const p = access.permissions;
  const refundable = await refundableAmount(db, payment.id);
  const approvals = await listApprovalsForRefunds(payment.refunds.map((r) => r.id));
  const isManual = payment.method === "CASH" || payment.method === "BANK_TRANSFER";
  const isOpen = OPEN_PAYMENT_STATUSES.includes(payment.status);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">
          {t("detailTitle")} · <PaymentMethodLabel method={payment.method} />
        </h1>
        <PaymentStatusBadge status={payment.status} />
      </div>
      <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sand-600">{t("booking")}</dt>
          <dd className="font-medium">
            {payment.booking ? (
              <Link
                href={`/admin/bookings/${payment.booking.id}`}
                className="text-brand-700 hover:underline"
              >
                {payment.booking.reference}
              </Link>
            ) : (
              "—"
            )}
            <span className="block text-xs text-sand-600">
              {payment.booking?.customer.name} · {payment.booking?.customer.email}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("amountXaf")}</dt>
          <dd className="font-semibold">
            {formatXaf(payment.amountXaf, currentLocale)}
            <span className="block text-xs font-normal text-sand-600">
              {t("ofWhichDeposit", { amount: formatXaf(payment.depositXaf, currentLocale) })}
              {payment.refundedXaf
                ? ` · ${t("refunded", { amount: formatXaf(payment.refundedXaf, currentLocale) })}`
                : ""}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("provider")}</dt>
          <dd className="font-medium">
            {payment.provider}{" "}
            {payment.providerEnvironment ? (
              <Badge tone={payment.providerEnvironment === "production" ? "good" : "warn"}>
                {enumLabel(tenv, "environments", payment.providerEnvironment)}
              </Badge>
            ) : null}
            <span className="block font-mono text-xs text-sand-600">
              {payment.providerReference ?? "—"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("timeline")}</dt>
          <dd className="text-xs text-sand-700">
            {t("created")}: {format.dateTime(payment.createdAt, "full")}
            {payment.confirmedAt ? (
              <>
                <br />
                {t("confirmed")}: {format.dateTime(payment.confirmedAt, "full")}
              </>
            ) : null}
            {payment.expiresAt && isOpen ? (
              <>
                <br />
                {t("expiresAt")}: {format.dateTime(payment.expiresAt, "full")}
              </>
            ) : null}
            {payment.reconciledAt ? (
              <>
                <br />
                {t("reconciledAt")}: {format.dateTime(payment.reconciledAt, "full")}
              </>
            ) : null}
            {payment.recordedBy ? (
              <>
                <br />
                {t("recordedBy")}: {payment.recordedBy.name}
              </>
            ) : null}
            {payment.failureCode ? (
              <>
                <br />
                <span className="text-danger-700">
                  {payment.failureCode}
                  {payment.failureMessage ? ` · ${payment.failureMessage}` : ""}
                </span>
              </>
            ) : null}
            {payment.payerPhoneMasked ? (
              <>
                <br />
                {t("payer")}: {payment.payerPhoneMasked}
              </>
            ) : null}
          </dd>
        </div>
      </dl>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isOpen && isManual && p.has("payment.record_manual") ? (
            <ConfirmManualPaymentForm paymentId={payment.id} />
          ) : null}
          {isOpen && !isManual && p.has("payment.reconcile") ? (
            <RefreshPaymentForm paymentId={payment.id} />
          ) : null}
          {p.has("refund.request") ? (
            <RefundRequestForm paymentId={payment.id} maxXaf={refundable} />
          ) : null}
          <section>
            <h2 className="text-lg font-semibold">{t("refunds")}</h2>
            {payment.refunds.length === 0 ? (
              <p className="text-sm text-sand-600">{t("noRefunds")}</p>
            ) : null}
            <ul className="mt-2 space-y-3">
              {payment.refunds.map((r) => {
                const mine = approvals.filter((a) => a.subjectId === r.id);
                const canDecide =
                  p.has("refund.approve") &&
                  (r.status === "PENDING_APPROVAL" || r.status === "REQUESTED") &&
                  r.requestedById !== user.id &&
                  !mine.some((a) => a.approverId === user.id);
                return (
                  <li
                    key={r.id}
                    className="space-y-2 rounded-xl border border-sand-200 bg-white p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{formatXaf(r.amountXaf, currentLocale)}</span>
                      <RefundStatusBadge status={r.status} />
                    </div>
                    <p className="text-sand-700">
                      {r.reason} · {r.requestedBy?.name ?? t("system")} ·{" "}
                      {format.dateTime(r.createdAt, "full")}
                      {r.requiresDualApproval ? ` · ${t("dualApproval")}` : ""}
                      {r.providerReference ? ` · ${r.providerReference}` : ""}
                      {r.failureMessage ? ` · ${r.failureMessage}` : ""}
                    </p>
                    {mine.length > 0 ? (
                      <p className="text-xs text-sand-600">
                        {mine
                          .map(
                            (a) =>
                              `${a.approver.name}: ${enumLabel(te, "approvalDecision", a.decision)}`,
                          )
                          .join(" · ")}
                      </p>
                    ) : null}
                    <RefundDecisionForm refundId={r.id} canDecide={canDecide} />
                    {r.status === "PROCESSING" && isManual && p.has("refund.approve") ? (
                      <CompleteManualRefundForm refundId={r.id} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
        <aside className="space-y-4">
          <section>
            <h2 className="font-semibold">{t("attempts")}</h2>
            <ul className="mt-2 space-y-1 text-xs text-sand-700">
              {payment.attempts.map((a) => (
                <li key={a.id}>
                  #{a.attemptNumber} · {enumLabel(tpay, "statuses", a.status)} ·{" "}
                  {format.dateTime(a.startedAt, "full")}
                  {a.errorMessage ? ` · ${a.errorMessage}` : ""}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-semibold">{t("webhooks")}</h2>
            {payment.webhookEvents.length === 0 ? (
              <p className="text-xs text-sand-600">{t("noWebhooks")}</p>
            ) : null}
            <ul className="mt-2 space-y-1 text-xs text-sand-700">
              {payment.webhookEvents.map((e) => (
                <li key={e.id}>
                  {format.dateTime(e.receivedAt, "full")} · {e.eventType} ·{" "}
                  {enumLabel(te, "webhookStatus", e.status)}
                  {e.signatureValid ? "" : ` · ${t("invalidSignature")}`}
                  {e.error ? ` · ${e.error}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
