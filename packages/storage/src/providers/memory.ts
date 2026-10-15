import { createHash } from "node:crypto";

import type { PutObjectInput, PutObjectResult, SignedUrlOptions, StorageProvider } from "../types";

/** Test double. */
export class MemoryStorageProvider implements StorageProvider {
  readonly name = "memory";
  readonly objects = new Map<string, { body: Buffer; contentType: string; access: string }>();

  async put(input: PutObjectInput): Promise<PutObjectResult> {
    const body = Buffer.from(input.body);
    this.objects.set(input.key, {
      body,
      contentType: input.contentType,
      access: input.access ?? "private",
    });
    return {
      key: input.key,
      sizeBytes: body.byteLength,
      checksumSha256: createHash("sha256").update(body).digest("hex"),
      provider: this.name,
    };
  }
  async getSignedReadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    return `memory://${key}?expires=${options.expiresInSeconds}`;
  }
  async getObject(key: string) {
    const o = this.objects.get(key);
    return o ? { body: o.body, contentType: o.contentType } : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async exists(key: string) {
    return this.objects.has(key);
  }
}
