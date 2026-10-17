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

/**
 * The storage provider is missing its configuration (e.g. STORAGE_PROVIDER=vercel-blob without
 * BLOB_READ_WRITE_TOKEN) or did not answer. Actions turn it into a clear message instead of
 * crashing the page; the administration dashboard warns staff (see storageStatus()).
 */
export class StorageUnavailableError extends Error {
  readonly code = "STORAGE_UNAVAILABLE";
  constructor(cause: unknown) {
    super("File storage is unavailable", { cause });
    this.name = "StorageUnavailableError";
  }
}

async function withStorage<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    logger.error("storage.unavailable", {
      operation,
      provider: getEnv().STORAGE_PROVIDER,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StorageUnavailableError(error);
  }
}

/** Cheap configuration check (no network): is the storage provider usable at all? */
export function storageStatus(): { ok: boolean; provider: string } {
  const provider = getEnv().STORAGE_PROVIDER;
  try {
    getStorageProvider();
    return { ok: true, provider };
  } catch {
    return { ok: false, provider };
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
  const result = await withStorage("put", () =>
    getStorageProvider().put({
      key: storageKey,
      body,
      contentType: mimeType,
      access,
    }),
  );

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
  const url = await withStorage("signedReadUrl", () =>
    getStorageProvider().getSignedReadUrl(input.storageKey, {
      expiresInSeconds: input.ttlSeconds ?? env.STORAGE_SIGNED_URL_TTL_SECONDS,
      fileName: input.fileName,
    }),
  );
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

/** Like signedDownloadUrl, but returns null when storage is unavailable (pages stay usable). */
export async function trySignedDownloadUrl(
  input: Parameters<typeof signedDownloadUrl>[0],
): Promise<string | null> {
  try {
    return await signedDownloadUrl(input);
  } catch (error) {
    if (error instanceof StorageUnavailableError) return null;
    throw error;
  }
}
