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
      if (!env.BLOB_READ_WRITE_TOKEN)
        throw new Error("BLOB_READ_WRITE_TOKEN is required for STORAGE_PROVIDER=vercel-blob");
      provider = new VercelBlobStorageProvider({ token: env.BLOB_READ_WRITE_TOKEN });
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
        path.resolve(process.cwd(), ".ridekmer-local-storage"),
        env.BETTER_AUTH_SECRET,
        env.NEXT_PUBLIC_APP_URL,
      );
  }
  return provider;
}

export function getMalwareScanner(): MalwareScanner {
  scanner ??= new NoopMalwareScanner();
  return scanner;
}

/** Tests only. */
export function setStorageProviderForTests(p: StorageProvider | undefined) {
  provider = p;
}
