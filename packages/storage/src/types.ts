export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /** Private by default; public only for approved vehicle photos. */
  access?: "private" | "public";
  metadata?: Record<string, string>;
}

export interface PutObjectResult {
  key: string;
  sizeBytes: number;
  checksumSha256: string;
  provider: string;
  /** Only present for public objects. */
  publicUrl?: string;
}

export interface SignedUrlOptions {
  expiresInSeconds: number;
  /** Suggested download file name. */
  fileName?: string;
}

export interface StorageProvider {
  readonly name: string;
  put(input: PutObjectInput): Promise<PutObjectResult>;
  /** Return a short-lived URL. Callers MUST perform access checks before calling this. */
  getSignedReadUrl(key: string, options: SignedUrlOptions): Promise<string>;
  getObject(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface MalwareScanResult {
  clean: boolean;
  engine: string;
  signature?: string;
  skipped?: boolean;
}

export interface MalwareScanner {
  readonly name: string;
  scan(body: Buffer | Uint8Array, fileName: string): Promise<MalwareScanResult>;
}

export interface FileValidationRule {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}
