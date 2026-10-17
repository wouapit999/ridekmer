import { createHash } from "node:crypto";

import { del, get, head, issueSignedToken, presignUrl, put } from "@vercel/blob";

import type { PutObjectInput, PutObjectResult, SignedUrlOptions, StorageProvider } from "../types";

export interface VercelBlobConfig {
  token: string;
}

/**
 * Vercel Blob storage. A Blob store is created either public or private and rejects uploads
 * of the other kind, so every object is stored private (the store must be a private one) and
 * read through presigned GET URLs that expire after the requested TTL — vehicle photos too.
 */
export class VercelBlobStorageProvider implements StorageProvider {
  readonly name = "vercel-blob";

  constructor(private readonly config: VercelBlobConfig) {}

  async put(input: PutObjectInput): Promise<PutObjectResult> {
    const body = Buffer.from(input.body);
    await put(input.key, body, {
      access: "private",
      contentType: input.contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      token: this.config.token,
    });
    return {
      key: input.key,
      sizeBytes: body.byteLength,
      checksumSha256: createHash("sha256").update(body).digest("hex"),
      provider: this.name,
    };
  }

  async getSignedReadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const validUntil = Date.now() + options.expiresInSeconds * 1000;
    const signed = await issueSignedToken({
      token: this.config.token,
      pathname: key,
      operations: ["get"],
      validUntil,
    });
    const result = await presignUrl(signed, {
      operation: "get",
      pathname: key,
      access: "private",
      validUntil,
    });
    return result.presignedUrl;
  }

  async getObject(key: string) {
    const result = await get(key, { access: "private", token: this.config.token });
    if (!result || !result.stream) return null;
    const body = Buffer.from(await new Response(result.stream).arrayBuffer());
    return { body, contentType: result.blob.contentType ?? "application/octet-stream" };
  }

  async delete(key: string): Promise<void> {
    await del(key, { token: this.config.token });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await head(key, { token: this.config.token });
      return true;
    } catch {
      return false;
    }
  }
}
