import { getTranslations } from "next-intl/server";

import { signedDownloadUrl, StorageUnavailableError } from "@/server/files/service";

/** Server component: resolves a short-lived signed URL after the caller performed access checks. */
export async function FileLink({
  storageKey,
  fileName,
  label,
  actorId,
  sensitive,
  reason,
}: {
  storageKey: string;
  fileName?: string;
  label: string;
  actorId?: string | null;
  sensitive?: boolean;
  reason?: string;
}) {
  let url: string;
  try {
    url = await signedDownloadUrl({ storageKey, fileName, actorId, sensitive, reason });
  } catch (error) {
    if (!(error instanceof StorageUnavailableError)) throw error;
    // Storage misconfigured or down: keep the page usable and say why the file is missing.
    const t = await getTranslations("common");
    return <span className="text-sm text-sand-600">{t("fileUnavailable")}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-brand-700 underline-offset-4 hover:underline"
    >
      {label}
    </a>
  );
}
