import { useFormatter, useNow, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/alert";

const TONE: Record<string, "neutral" | "brand" | "warn" | "danger" | "good"> = {
  DRAFT: "neutral",
  SUBMITTED: "brand",
  UNDER_REVIEW: "brand",
  VERIFIED: "good",
  REJECTED: "danger",
  EXPIRED: "danger",
  REPLACED: "neutral",
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const t = useTranslations("documents.status");
  return <Badge tone={TONE[status] ?? "neutral"}>{t(status as "DRAFT")}</Badge>;
}

export function DocumentExpiry({
  expiryDate,
  status,
}: {
  expiryDate: Date | null;
  status: string;
}) {
  const t = useTranslations("documents");
  const format = useFormatter();
  const now = useNow();
  if (!expiryDate) return <span className="text-sand-500">{t("noExpiry")}</span>;
  const days = Math.ceil((expiryDate.getTime() - now.getTime()) / 86_400_000);
  if (status === "EXPIRED" || days < 0)
    return (
      <span className="text-danger-700">
        {t("expiredOn", { date: format.dateTime(expiryDate, "short") })}
      </span>
    );
  return (
    <span className={days <= 30 ? "text-accent-700" : "text-sand-700"}>
      {t("expiresIn", { days })}
    </span>
  );
}
