import path from "node:path";

import {
  LocalDiskStorageProvider,
  NoopMalwareScanner,
  S3StorageProvider,
  VercelBlobStorageProvider,
  type MalwareScanner,
  type StorageProvider,
} from "@ridekmer/storage";

import { getEnv } from "@/lib/env";

let provider: StorageProvider | undefined;
let scanner: MalwareScanner | undefined;

/** Resolve the configured private storage provider (ADR-009). */
export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  const env = getEnv();
  switch (env.STORAGE_PROVIDER) {
    case "vercel-blob": {
      const token = resolveBlobToken(env.BLOB_READ_WRITE_TOKEN, process.env);
      // Without a token, @vercel/blob authenticates with the deployment's OIDC token and
      // BLOB_STORE_ID, both set by Vercel when a store is connected to the project.
      if (!token && !process.env.BLOB_STORE_ID)
        throw new Error(
          "BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID is required for STORAGE_PROVIDER=vercel-blob",
        );
      provider = new VercelBlobStorageProvider({ token });
      break;
    }
    case "s3": {
      if (!env.S3_BUCKET || !env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        throw new Error(
          "S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for STORAGE_PROVIDER=s3",
        );
      }
      provider = new S3StorageProvider({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      });
      break;
    }
    default:
      provider = new LocalDiskStorageProvider(
        env.STORAGE_LOCAL_ROOT ?? path.resolve(process.cwd(), ".ridekmer-local-storage"),
        env.BETTER_AUTH_SECRET,
        env.NEXT_PUBLIC_APP_URL,
        // A persistent volume (STORAGE_LOCAL_ROOT) is the only production-safe local root.
        { allowInProduction: Boolean(env.STORAGE_LOCAL_ROOT) },
      );
  }
  return provider;
}

/**
 * BLOB_READ_WRITE_TOKEN, or the token Vercel added under a custom prefix when the store was
 * connected (e.g. RIDEKMER_FILES_READ_WRITE_TOKEN). Only an unambiguous single match is used.
 */
export function resolveBlobToken(
  configured: string | undefined,
  environment: Record<string, string | undefined>,
): string | undefined {
  if (configured) return configured;
  const candidates = Object.entries(environment).filter(
    ([name, value]) => name.endsWith("_READ_WRITE_TOKEN") && value?.startsWith("vercel_blob_rw_"),
  );
  return candidates.length === 1 ? candidates[0]![1] : undefined;
}

export function getMalwareScanner(): MalwareScanner {
  scanner ??= new NoopMalwareScanner();
  return scanner;
}

/** Tests only. */
export function setStorageProviderForTests(p: StorageProvider | undefined) {
  provider = p;
}
