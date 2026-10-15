import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/alert";

const TONE: Record<string, "neutral" | "brand" | "warn" | "danger" | "good"> = {
  DRAFT: "neutral",
  PENDING_VERIFICATION: "warn",
  PAYMENT_PENDING: "warn",
  CONFIRMED: "good",
  READY_FOR_PICKUP: "good",
  ACTIVE: "brand",
  EXTENSION_REQUESTED: "brand",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
  DISPUTED: "danger",
};

export function BookingStatusBadge({ status }: { status: string }) {
  const t = useTranslations("bookings.statuses");
  return <Badge tone={TONE[status] ?? "neutral"}>{t(status as "DRAFT")}</Badge>;
}
