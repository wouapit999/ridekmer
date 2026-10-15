import { randomUUID } from "node:crypto";

import { buildObjectKey, validateFile, type FileValidationError } from "@ridekmer/storage";

import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";

import { getMalwareScanner, getStorageProvider } from "./storage";

export type FileScope =
  | "vehicle-docs"
  | "vehicle-images"
  | "kyc"
  | "contracts"
  | "inspections"
  | "incidents"
  | "receipts";

const PUBLIC_SCOPES: FileScope[] = ["vehicle-images"];

export interface StoreFileInput {
  scope: FileScope;
  entityId: string;
  file: File;
  allowedMimeTypes: string[];
  maxSizeBytes?: number;
  actorId?: string | null;
  /** Public only for approved vehicle photos. */
  access?: "private" | "public";
}

export interface StoredFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  publicUrl?: string;
}

export class FileRejectedError extends Error {
  constructor(public readonly reason: FileValidationError | { code: "MALWARE"; message: string }) {
    super(reason.message);
    this.name = "FileRejectedError";
  }
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Validate, scan, store and audit an uploaded file. Never trusts the client file name. */
export async function storeFile(input: StoreFileInput): Promise<StoredFile> {
  const env = getEnv();
  const maxSizeBytes = Math.min(
    input.maxSizeBytes ?? env.STORAGE_MAX_FILE_SIZE_BYTES,
    env.STORAGE_MAX_FILE_SIZE_BYTES,
  );
  const body = new Uint8Array(await input.file.arrayBuffer());
  const mimeType = input.file.type || "application/octet-stream";
  const validation = validateFile(body, mimeType, {
    allowedMimeTypes: input.allowedMimeTypes,
    maxSizeBytes,
  });
  if (validation) throw new FileRejectedError(validation);

  const scan = await getMalwareScanner().scan(body, input.file.name);
  if (!scan.clean)
    throw new FileRejectedError({ code: "MALWARE", message: `Rejected by ${scan.engine}` });

  const storageKey = buildObjectKey({
    scope: input.scope,
    entityId: input.entityId,
    fileId: randomUUID(),
    extension: EXTENSIONS[mimeType] ?? "bin",
  });
  const access = input.access ?? (PUBLIC_SCOPES.includes(input.scope) ? "public" : "private");
  const result = await getStorageProvider().put({
    key: storageKey,
    body,
    contentType: mimeType,
    access,
  });

  await recordAudit({
    actorId: input.actorId,
    action: "file.upload",
    entityType: "File",
    entityId: storageKey,
    after: {
      scope: input.scope,
      entityId: input.entityId,
      mimeType,
      sizeBytes: body.byteLength,
      checksum: result.checksumSha256,
      scan: scan.engine,
      access,
    },
  });

  return {
    storageKey,
    fileName: sanitiseFileName(input.file.name),
    mimeType,
    fileSizeBytes: body.byteLength,
    checksumSha256: result.checksumSha256,
    publicUrl: result.publicUrl,
  };
}

export function sanitiseFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

/**
 * Produce a short-lived download URL. Callers MUST have performed the access check already;
 * this function records who accessed which sensitive file and why.
 */
export async function signedDownloadUrl(input: {
  storageKey: string;
  fileName?: string;
  actorId?: string | null;
  sensitive?: boolean;
  reason?: string;
  ttlSeconds?: number;
}): Promise<string> {
  const env = getEnv();
  const url = await getStorageProvider().getSignedReadUrl(input.storageKey, {
    expiresInSeconds: input.ttlSeconds ?? env.STORAGE_SIGNED_URL_TTL_SECONDS,
    fileName: input.fileName,
  });
  if (input.sensitive) {
    await recordAudit({
      actorId: input.actorId,
      action: "file.sensitive_access",
      entityType: "File",
      entityId: input.storageKey,
      reason: input.reason,
    });
  } else {
    logger.debug("file.access", { key: input.storageKey, actorId: input.actorId });
  }
  return url;
}

export async function deleteStoredFile(storageKey: string, actorId?: string | null): Promise<void> {
  await getStorageProvider().delete(storageKey);
  await recordAudit({ actorId, action: "file.delete", entityType: "File", entityId: storageKey });
}
