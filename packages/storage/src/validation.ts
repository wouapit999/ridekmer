import type { FileValidationRule } from "./types";

const MAGIC_NUMBERS: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

export interface FileValidationError {
  code: "TOO_LARGE" | "EMPTY" | "MIME_NOT_ALLOWED" | "CONTENT_MISMATCH";
  message: string;
}

/** Validates size, declared MIME type and (for known formats) the file signature. */
export function validateFile(
  body: Uint8Array,
  declaredMime: string,
  rule: FileValidationRule,
): FileValidationError | null {
  if (body.byteLength === 0) return { code: "EMPTY", message: "File is empty" };
  if (body.byteLength > rule.maxSizeBytes) {
    return { code: "TOO_LARGE", message: `File exceeds ${rule.maxSizeBytes} bytes` };
  }
  if (!rule.allowedMimeTypes.includes(declaredMime)) {
    return { code: "MIME_NOT_ALLOWED", message: `MIME type ${declaredMime} is not allowed` };
  }
  const signature = MAGIC_NUMBERS.find((m) => m.mime === declaredMime);
  if (signature) {
    const offset = signature.offset ?? 0;
    const matches = signature.bytes.every((b, i) => body[offset + i] === b);
    if (!matches)
      return { code: "CONTENT_MISMATCH", message: "File content does not match its declared type" };
  }
  return null;
}

/** Build a safe object key: no path traversal, no user-controlled file names. */
export function buildObjectKey(parts: {
  scope: string;
  entityId: string;
  fileId: string;
  extension: string;
}): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = clean(parts.extension).toLowerCase().slice(0, 8);
  return `${clean(parts.scope)}/${clean(parts.entityId)}/${clean(parts.fileId)}${ext ? `.${ext}` : ""}`;
}
