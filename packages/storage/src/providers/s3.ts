import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { PutObjectInput, PutObjectResult, SignedUrlOptions, StorageProvider } from "../types";

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Required for most S3-compatible providers (MinIO, Backblaze, Scaleway…). */
  forcePathStyle?: boolean;
  /** Base URL for public objects, when a bucket policy exposes them. */
  publicBaseUrl?: string;
}

/**
 * S3-compatible private storage. Objects are private by default; reads go through short-lived
 * presigned URLs generated only after the application has checked access.
 * Status: implemented against the AWS SDK; not yet exercised against a live bucket
 * (docs/OPEN_ITEMS.md).
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(input: PutObjectInput): Promise<PutObjectResult> {
    const body = Buffer.from(input.body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
        Metadata: input.metadata,
        ACL: input.access === "public" ? "public-read" : "private",
      }),
    );
    return {
      key: input.key,
      sizeBytes: body.byteLength,
      checksumSha256: createHash("sha256").update(body).digest("hex"),
      provider: this.name,
      publicUrl:
        input.access === "public" && this.config.publicBaseUrl
          ? `${this.config.publicBaseUrl}/${input.key}`
          : undefined,
    };
  }

  async getSignedReadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentDisposition: options.fileName
        ? `attachment; filename="${options.fileName.replace(/"/g, "")}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: options.expiresInSeconds });
  }

  async getObject(key: string) {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        body: Buffer.from(bytes),
        contentType: result.ContentType ?? "application/octet-stream",
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
