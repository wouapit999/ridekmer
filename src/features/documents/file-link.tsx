import { signedDownloadUrl } from "@/server/files/service";

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
  const url = await signedDownloadUrl({ storageKey, fileName, actorId, sensitive, reason });
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
