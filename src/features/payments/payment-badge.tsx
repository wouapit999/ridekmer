import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/alert";

const TONE: Record<string, "neutral" | "brand" | "warn" | "danger" | "good"> = {
  CREATED: "neutral",
  PENDING: "warn",
  REQUIRES_CUSTOMER_ACTION: "warn",
  PROCESSING: "brand",
  SUCCESSFUL: "good",
  FAILED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  PARTIALLY_REFUNDED: "brand",
  REFUNDED: "brand",
  CHARGEBACK: "danger",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const t = useTranslations("payments.statuses");
  return <Badge tone={TONE[status] ?? "neutral"}>{t(status as "CREATED")}</Badge>;
}

const REFUND_TONE: Record<string, "neutral" | "brand" | "warn" | "danger" | "good"> = {
  REQUESTED: "warn",
  PENDING_APPROVAL: "warn",
  APPROVED: "brand",
  PROCESSING: "brand",
  COMPLETED: "good",
  FAILED: "danger",
  REJECTED: "danger",
};

export function RefundStatusBadge({ status }: { status: string }) {
  const t = useTranslations("payments.refundStatuses");
  return <Badge tone={REFUND_TONE[status] ?? "neutral"}>{t(status as "REQUESTED")}</Badge>;
}

export function PaymentMethodLabel({ method }: { method: string }) {
  const t = useTranslations("payments.methods");
  return <>{t(method as "CARD")}</>;
}
