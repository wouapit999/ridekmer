import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PutObjectInput, PutObjectResult, SignedUrlOptions, StorageProvider } from "../types";

/**
 * DEVELOPMENT ONLY. Stores files under a local directory and signs URLs with an HMAC that a
 * local route handler verifies. Refuses to start in production because Vercel functions have
 * no persistent filesystem.
 */
export class LocalDiskStorageProvider implements StorageProvider {
  readonly name = "local";

  constructor(
    private readonly rootDir: string,
    private readonly signingSecret: string,
    private readonly baseUrl: string,
    options: { allowInProduction?: boolean } = {},
  ) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.APP_ENV === "production" &&
      !options.allowInProduction
    ) {
      throw new Error(
        "LocalDiskStorageProvider must not be used in production without a persistent volume",
      );
    }
  }

  private resolve(key: string): string {
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(path.resolve(this.rootDir) + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(input: PutObjectInput): Promise<PutObjectResult> {
    const full = this.resolve(input.key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.body);
    await writeFile(
      `${full}.meta.json`,
      JSON.stringify({ contentType: input.contentType, access: input.access ?? "private" }),
    );
    return {
      key: input.key,
      sizeBytes: input.body.byteLength,
      checksumSha256: createHash("sha256").update(input.body).digest("hex"),
      provider: this.name,
      publicUrl:
        input.access === "public" ? `${this.baseUrl}/api/storage/local/${input.key}` : undefined,
    };
  }

  async getSignedReadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + options.expiresInSeconds;
    const sig = createHmac("sha256", this.signingSecret).update(`${key}:${expires}`).digest("hex");
    const name = options.fileName ? `&name=${encodeURIComponent(options.fileName)}` : "";
    return `${this.baseUrl}/api/storage/local/${key}?expires=${expires}&sig=${sig}${name}`;
  }

  verifySignature(key: string, expires: number, sig: string): boolean {
    if (expires < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac("sha256", this.signingSecret)
      .update(`${key}:${expires}`)
      .digest("hex");
    return expected.length === sig.length && expected === sig;
  }

  async getObject(key: string) {
    const full = this.resolve(key);
    try {
      const [body, meta] = await Promise.all([
        readFile(full),
        readFile(`${full}.meta.json`, "utf8"),
      ]);
      return { body, contentType: (JSON.parse(meta) as { contentType: string }).contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const full = this.resolve(key);
    await rm(full, { force: true });
    await rm(`${full}.meta.json`, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
